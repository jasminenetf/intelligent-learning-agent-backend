"""RAG API routes: build index, search, status."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.auth import get_current_user
from app.core.database import get_session
from app.models.user import User
from app.schemas.rag import (
    BuildIndexResponse,
    RagStatusResponse,
    SearchRequest,
    SearchResponse,
)
from app.services.rag_service import (
    build_course_index,
    get_rag_status,
    search_course,
)

router = APIRouter(prefix="/api/rag", tags=["rag"])

def _require_teacher_or_admin(user: User):
    if user.role not in ("teacher", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only teachers and admins can perform this action")

@router.post("/courses/{course_id}/build", response_model=BuildIndexResponse)
def api_build_index(course_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    _require_teacher_or_admin(user)
    result = build_course_index(course_id, session)
    if "error" in result:
        code = 404 if "not found" in result["error"] else 400
        raise HTTPException(status_code=code, detail=result["error"])
    return BuildIndexResponse(**result)

@router.get("/courses/{course_id}/search", response_model=SearchResponse)
def api_search_get(
    course_id: int,
    q: str = Query(..., min_length=1),
    top_k: int = Query(default=5, ge=1, le=20),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    result = search_course(course_id, q, top_k, session)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return SearchResponse(**result)

@router.post("/courses/{course_id}/search", response_model=SearchResponse)
def api_search_post(
    course_id: int,
    body: SearchRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    result = search_course(course_id, body.query, body.top_k, session)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return SearchResponse(**result)

# ════════════ R2.3: File upload + auto-index ════════════
import os
import tempfile
from fastapi import UploadFile, File, Form

@router.post("/upload")
async def api_upload_file(
    file: UploadFile = File(...),
    course_id: int = Form(default=2),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Upload PDF/TXT, parse, chunk, embed, and index into ChromaDB."""
    _require_teacher_or_admin(user)

    # Validate extension
    fname = file.filename or "upload.pdf"
    ext = os.path.splitext(fname)[1].lower()
    if ext not in (".pdf", ".txt", ".md", ".docx"):
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}. Use PDF, TXT, MD, or DOCX.")

    # Save temp file
    suffix = ext if ext else ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Parse document
        from app.services.document_parser import parse_document
        from app.services.chunker import chunk_document
        from app.services.vector_store import add_chunks_to_store
        from app.models.knowledge_chunk import KnowledgeChunk
        from app.models.course_file import CourseFile

        # Parse
        parse_result = parse_document(tmp_path, fname)
        if "error" in parse_result:
            raise HTTPException(status_code=400, detail=parse_result["error"])

        text = parse_result.get("text", "")
        page_count = parse_result.get("page_count", 1)

        # Chunk
        chunks = chunk_document(text, fname)
        chunk_count = len(chunks)

        # Store in DB
        for i, chunk in enumerate(chunks):
            kc = KnowledgeChunk(
                course_id=course_id,
                source=fname,
                content=chunk,
                chunk_index=i,
                page_number=min(i + 1, page_count) if page_count else None,
            )
            session.add(kc)
        session.commit()

        # Index in ChromaDB
        try:
            add_chunks_to_store(course_id, chunks, session)
            indexed = True
        except Exception as e:
            logger.warning("ChromaDB indexing skipped: %s", e)
            indexed = False

        # Record file
        cf = CourseFile(
            course_id=course_id,
            filename=fname,
            file_size=len(content),
            file_type=ext.lstrip("."),
            chunk_count=chunk_count,
        )
        session.add(cf)
        session.commit()

        return {
            "ok": True,
            "filename": fname,
            "file_size": len(content),
            "page_count": page_count,
            "chunk_count": chunk_count,
            "indexed": indexed,
            "message": f"已解析 {page_count} 页，生成 {chunk_count} 个知识切片" + ("，已向量化入库" if indexed else ""),
        }

    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

@router.get("/status", response_model=RagStatusResponse)
def api_rag_status(user: User = Depends(get_current_user), _session: Session = Depends(get_session)):
    _require_teacher_or_admin(user)
    return RagStatusResponse(**get_rag_status())

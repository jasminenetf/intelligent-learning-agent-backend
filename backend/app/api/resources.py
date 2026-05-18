"""Unified resource generation API.

POST /api/resources/courses/{course_id}/generate
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.auth import get_current_user
from app.core.database import get_session
from app.models.user import User
from app.schemas.resource import ResourcePackRequest, ResourcePackResponse
from app.services.resource_generator import generate_resource_pack

router = APIRouter(prefix="/api/resources", tags=["resources"])


@router.post("/courses/{course_id}/generate", response_model=ResourcePackResponse)
def api_generate_resources(
    course_id: int,
    body: ResourcePackRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Generate educational resources for a course topic.

    Supported resource_types: mindmap, lecture_doc, quiz.

    Returns a resource pack with generated resources and source citations.
    """
    try:
        result = generate_resource_pack(
            course_id=course_id,
            topic=body.topic,
            resource_types=list(body.resource_types),
            student_profile=body.student_profile.model_dump(),
            top_k=body.top_k,
            session=session,
            user=user,
        )
        return result
    except ValueError as e:
        msg = str(e)
        if "course not found" in msg:
            raise HTTPException(status_code=404, detail=msg)
        if "no relevant" in msg:
            raise HTTPException(status_code=400, detail=msg)
        raise HTTPException(status_code=500, detail=msg)

import json
import os
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.config import settings
from app.database import get_db
from app.models.floor_plan import FloorPlan
from app.models.resource import Resource
from app.models.user import User
from app.schemas.floor_plan import FloorPlanOut, FloorPlanUpdate
from app.utils.urls import api_url

router = APIRouter(prefix="/floor-plans", tags=["floor-plans"])

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def _is_blob_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def _resolve_floor_plan(db: Session, plan_key: str) -> FloorPlan | None:
    plan = None
    if plan_key.isdigit():
        plan = db.get(FloorPlan, int(plan_key))
    if not plan:
        plan = db.query(FloorPlan).filter(FloorPlan.floor == plan_key).first()
    return plan


def _store_blob(pathname: str, content: bytes, content_type: str) -> str:
    blob_token = os.getenv("BLOB_READ_WRITE_TOKEN")
    if not blob_token:
        raise HTTPException(
            status_code=500,
            detail="Blob storage is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel.",
        )

    store_id = (os.getenv("BLOB_STORE_ID") or "").strip().strip('"').strip("'")
    if store_id.startswith("store_"):
        store_id = store_id[len("store_") :]
    if not store_id and blob_token.startswith("vercel_blob_rw_"):
        token_parts = blob_token.split("_")
        if len(token_parts) >= 4:
            store_id = token_parts[3]
    if not store_id:
        raise HTTPException(
            status_code=500,
            detail="Blob storage is missing BLOB_STORE_ID in Vercel.",
        )

    request = Request(
        f"https://vercel.com/api/blob/{quote(pathname)}",
        data=content,
        headers={
            "Authorization": f"Bearer {blob_token}",
            "Content-Type": content_type or "application/octet-stream",
            "x-api-version": "7",
            "x-content-length": str(len(content)),
            "x-vercel-blob-store-id": store_id,
            "x-vercel-blob-access": "private",
            "x-add-random-suffix": "1",
        },
        method="PUT",
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"Blob upload failed: {detail}") from exc
    except (URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail=f"Blob upload failed: {exc}") from exc

    url = payload.get("url")
    if not url:
        raise HTTPException(status_code=502, detail="Blob upload did not return a URL")
    return url


def _store_floor_plan_bytes(filename: str, content: bytes, content_type: str) -> str:
    if os.getenv("VERCEL") or os.getenv("BLOB_READ_WRITE_TOKEN"):
        return _store_blob(f"floor-plans/{filename}", content, content_type)

    os.makedirs(settings.upload_dir, exist_ok=True)
    filepath = os.path.join(settings.upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)
    return filepath


@router.get("", response_model=list[FloorPlanOut])
def list_floor_plans(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    plans = db.query(FloorPlan).order_by(FloorPlan.floor).all()
    return [
        FloorPlanOut(
            id=p.id,
            name=p.name,
            building=p.building,
            floor=p.floor,
            image_url=api_url(f"/api/floor-plans/{p.id}/image"),
        )
        for p in plans
    ]


@router.post("", response_model=FloorPlanOut)
async def upload_floor_plan(
    floor: str = Form(...),
    name: str | None = Form(None),
    building: str = Form("HQ - Prishtina"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PNG/JPG images allowed")

    filename = f"{uuid.uuid4().hex}{ext}"
    content = await file.read()
    image_path = _store_floor_plan_bytes(filename, content, file.content_type or "application/octet-stream")

    existing = db.query(FloorPlan).filter(FloorPlan.floor == floor).first()
    if existing:
        if existing.image_path and not _is_blob_url(existing.image_path):
            existing_path = Path(existing.image_path)
            if not existing_path.is_absolute():
                existing_path = Path(settings.upload_dir).resolve() / existing_path.name
            if existing_path.exists():
                existing_path.unlink()
        existing.image_path = image_path
        existing.name = name.strip() if name and name.strip() else existing.name
        existing.building = building
        db.commit()
        db.refresh(existing)
        plan = existing
    else:
        plan = FloorPlan(
            name=name.strip() if name and name.strip() else f"Floor {floor}",
            building=building,
            floor=floor,
            image_path=image_path,
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)

    return FloorPlanOut(
        id=plan.id,
        name=plan.name,
        building=plan.building,
        floor=plan.floor,
        image_url=api_url(f"/api/floor-plans/{plan.id}/image"),
    )


@router.get("/{plan_id}/image")
def get_floor_plan_image(plan_id: int, db: Session = Depends(get_db)):
    plan = db.get(FloorPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Image not found")
    if _is_blob_url(plan.image_path):
        blob_token = os.getenv("BLOB_READ_WRITE_TOKEN")
        headers = {"Authorization": f"Bearer {blob_token}"} if blob_token else {}
        request = Request(plan.image_path, headers=headers)
        try:
            with urlopen(request, timeout=30) as response:
                content = response.read()
                media_type = response.headers.get("Content-Type", "application/octet-stream")
        except HTTPError as exc:
            if exc.code == 404:
                raise HTTPException(status_code=404, detail="Image not found") from exc
            detail = exc.read().decode("utf-8", errors="replace")
            raise HTTPException(status_code=502, detail=f"Blob download failed: {detail}") from exc
        except (URLError, TimeoutError) as exc:
            raise HTTPException(status_code=502, detail=f"Blob download failed: {exc}") from exc
        return Response(content, media_type=media_type, headers={"Cache-Control": "no-store"})
    image_path = Path(plan.image_path)
    if not image_path.is_absolute():
        image_path = Path(settings.upload_dir).resolve() / image_path.name
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(image_path), headers={"Cache-Control": "no-store"})


@router.put("/{plan_id}", response_model=FloorPlanOut)
def update_floor_plan(
    plan_id: str,
    data: FloorPlanUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    plan = _resolve_floor_plan(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")

    duplicate = (
        db.query(FloorPlan)
        .filter(FloorPlan.floor == data.floor, FloorPlan.id != plan.id)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A floor plan already exists for that floor")

    previous_floor = plan.floor
    plan.name = data.name.strip() if data.name and data.name.strip() else f"Floor {data.floor}"
    plan.building = data.building
    plan.floor = data.floor
    linked_resources = db.query(Resource).filter(Resource.floor == previous_floor).all()
    for resource in linked_resources:
        resource.floor = data.floor
        resource.building = data.building
    db.commit()
    db.refresh(plan)
    return FloorPlanOut(
        id=plan.id,
        name=plan.name,
        building=plan.building,
        floor=plan.floor,
        image_url=api_url(f"/api/floor-plans/{plan.id}/image"),
    )


@router.delete("/{plan_id}")
def delete_floor_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    plan = _resolve_floor_plan(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")

    image_path = Path(plan.image_path)
    if not _is_blob_url(plan.image_path) and not image_path.is_absolute():
        image_path = Path(settings.upload_dir).resolve() / image_path.name
    db.delete(plan)
    db.commit()

    if image_path.exists():
        image_path.unlink()

    return {"detail": "Floor plan deleted"}

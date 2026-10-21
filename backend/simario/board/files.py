"""Attachment files (NFR-009 … 012, spec §4.7): content checks, storage in RustFS, ClamAV scan,
quarantine and pre-signed downloads. Only standard S3 calls and the clamd INSTREAM protocol."""

import logging
import socket
import struct
from typing import Any

import puremagic
from django.conf import settings

from simario.core.storage import s3_client

log = logging.getLogger(__name__)

# Extension → MIME types the content may have (NFR-009). DOCX/XLSX are ZIP containers.
ALLOWED_MIME = {
    "pdf": {"application/pdf"},
    "docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",
    },
    "xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
    },
    "png": {"image/png"},
    "jpg": {"image/jpeg"},
    "jpeg": {"image/jpeg"},
    "mp4": {"video/mp4"},
}
CONTENT_MISMATCH = "Isi berkas tidak sesuai dengan formatnya."
URL_SECONDS = 5 * 60


def content_mime(name: str, data: bytes) -> str | None:
    """The MIME type the content proves for the file's extension; None when it does not match."""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    allowed = ALLOWED_MIME.get(ext, set())
    try:
        guesses = {m.mime_type for m in puremagic.magic_string(data[:4096])}
    except puremagic.PureError:
        guesses = set()
    found = next((m for m in guesses if m in allowed), None)
    if found is None:
        return None
    if found == "application/zip":
        return sorted(allowed - {"application/zip"})[0]
    return str(found)


def key_for(position_id: Any, fiscal_year: int, attachment_id: Any) -> str:
    return f"attachments/{position_id}/{fiscal_year}/{attachment_id}"


def put(key: str, data: bytes, mime: str) -> None:
    s3_client().put_object(Bucket=settings.S3_BUCKET, Key=key, Body=data, ContentType=mime)


def delete(key: str) -> None:
    s3_client().delete_object(Bucket=settings.S3_BUCKET, Key=key)


def read(key: str) -> bytes:
    body = s3_client().get_object(Bucket=settings.S3_BUCKET, Key=key)["Body"]
    return bytes(body.read())


def quarantine(key: str) -> str:
    """Moves an infected object under quarantine/ (copy + delete: S3 has no move)."""
    target = f"quarantine/{key}"
    client = s3_client()
    client.copy_object(
        Bucket=settings.S3_BUCKET,
        Key=target,
        CopySource={"Bucket": settings.S3_BUCKET, "Key": key},
    )
    client.delete_object(Bucket=settings.S3_BUCKET, Key=key)
    return target


def presigned_url(key: str, filename: str) -> str:
    """A 5-minute download URL under the application origin (`/storage/…`): signed for the
    storage host the proxy forwards to, then rebased so RustFS is never exposed directly."""
    import boto3
    from botocore.config import Config

    client = boto3.client(
        "s3",
        endpoint_url=settings.S3_PUBLIC_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    url = client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.S3_BUCKET,
            "Key": key,
            "ResponseContentDisposition": f'attachment; filename="{filename}"',
        },
        ExpiresIn=URL_SECONDS,
    )
    base = settings.S3_PUBLIC_ENDPOINT.rstrip("/")
    return str(url).replace(base, settings.S3_PUBLIC_PREFIX.rstrip("/"), 1)


def clamd_scan(data: bytes) -> bool:
    """True when ClamAV reports the content clean (INSTREAM). Raises OSError when clamd is down."""
    with socket.create_connection((settings.CLAMAV_HOST, settings.CLAMAV_PORT), timeout=30) as s:
        s.sendall(b"zINSTREAM\0")
        for i in range(0, len(data), 64 * 1024):
            chunk = data[i : i + 64 * 1024]
            s.sendall(struct.pack(">I", len(chunk)) + chunk)
        s.sendall(struct.pack(">I", 0))
        reply = s.recv(4096).rstrip(b"\0\n").decode(errors="replace")
    log.info("clamd: %s", reply)
    if reply.endswith("OK"):
        return True
    if reply.endswith("FOUND"):
        return False
    raise OSError(f"clamd: {reply}")

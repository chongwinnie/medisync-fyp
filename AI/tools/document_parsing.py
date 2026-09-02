"""Document parsing tool — extract text and structured sections from medical documents."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from langchain_core.tools import tool


def _extract_text_from_pdf(path_or_url: str) -> str:
    """Attempt PDF text extraction. Falls back to stub if pypdf unavailable."""
    try:
        if path_or_url.startswith("http"):
            import httpx
            resp = httpx.get(path_or_url, timeout=30)
            resp.raise_for_status()
            content = resp.content
        else:
            content = Path(path_or_url).read_bytes()

        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except ImportError:
        return f"[stub] pypdf not installed — extracted text from {path_or_url}"
    except Exception as exc:
        return f"[error] Could not read document: {exc}"


def _structure_medical_text(raw_text: str) -> dict:
    """Heuristically split raw text into common medical document sections."""
    section_headers = [
        "Patient Information", "Chief Complaint", "History of Present Illness",
        "Past Medical History", "Medications", "Allergies", "Physical Examination",
        "Assessment", "Plan", "Lab Results", "Imaging", "Diagnosis", "Recommendations",
    ]
    sections: dict[str, str] = {"full_text": raw_text}
    for header in section_headers:
        pattern = re.compile(rf"{re.escape(header)}[:\s]*(.*?)(?=\n[A-Z][a-zA-Z ]+[:\n]|$)", re.DOTALL | re.IGNORECASE)
        match = pattern.search(raw_text)
        if match:
            sections[header.lower().replace(" ", "_")] = match.group(1).strip()[:2000]
    return sections


@tool
def parse_medical_document(file_url_or_path: str, doc_type: str = "pdf") -> str:
    """
    Parse a medical document and extract structured text sections.

    Args:
        file_url_or_path: Local filesystem path or HTTPS URL to the document.
        doc_type: Document type ('pdf', 'txt'). Only 'pdf' is fully implemented.

    Returns:
        JSON string with extracted sections: full_text, and named sections if detectable.
    """
    try:
        if doc_type == "txt":
            if file_url_or_path.startswith("http"):
                import httpx
                raw_text = httpx.get(file_url_or_path, timeout=30).text
            else:
                raw_text = Path(file_url_or_path).read_text(encoding="utf-8", errors="replace")
        else:
            raw_text = _extract_text_from_pdf(file_url_or_path)

        structured = _structure_medical_text(raw_text)
        structured["source"] = file_url_or_path
        structured["doc_type"] = doc_type
        structured["char_count"] = len(raw_text)

        return json.dumps(structured, ensure_ascii=False)

    except Exception as exc:
        return json.dumps({"error": str(exc), "source": file_url_or_path, "full_text": ""})

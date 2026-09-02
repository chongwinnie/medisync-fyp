"""POST /diagnostics/analyze — medical image analysis endpoint."""
from __future__ import annotations

import json

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class AnalyzeRequest(BaseModel):
    image_base64: str
    modality: str = "other"
    clinical_context: str = ""


@router.post("/diagnostics/analyze")
async def analyze_diagnostic_image(request: AnalyzeRequest):
    from tools.image_analysis import analyze_medical_image

    data_uri = request.image_base64
    if not data_uri.startswith("data:"):
        data_uri = f"data:image/jpeg;base64,{request.image_base64}"

    result = analyze_medical_image.invoke(
        {
            "image_url": data_uri,
            "modality": request.modality,
            "clinical_context": request.clinical_context,
        }
    )

    try:
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = {
            "impression": result,
            "findings": [],
            "recommendations": [],
            "disclaimer": "AI analysis for clinician review only.",
        }

    if parsed.get("error"):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            {
                "error": f"AI Vision Model Error: {parsed['error']}",
                "summary": parsed.get("impression", parsed["error"]),
                "impression": parsed.get("impression", parsed["error"]),
                "differentials": [],
                "findings": [],
                "recommendations": [],
                "disclaimer": parsed.get("disclaimer", "AI vision service error."),
            },
            status_code=502,
        )

    differentials = parsed.get("differentials", [])
    if not differentials:
        findings = parsed.get("findings", [])
        if isinstance(findings, list):
            for finding in findings[:4]:
                if isinstance(finding, dict):
                    differentials.append(
                        {
                            "label": finding.get("observation", "Clinical Observation"),
                            "confidence": finding.get("confidence", "Medium"),
                            "icd_code": "R69",
                            "description": finding.get("location", "Target Region"),
                        }
                    )

    try:
        from tools.auto_reindex import trigger_continuous_reindex
        trigger_continuous_reindex()
    except Exception:
        pass

    return {
        "summary": parsed.get("impression", result[:500]),
        "impression": parsed.get("impression", ""),
        "modality": parsed.get("modality", request.modality),
        "region": parsed.get("region", "Clinical Region of Interest"),
        "findings": parsed.get("findings", []),
        "differentials": differentials,
        "recommendations": parsed.get("recommendations", []),
        "critical_alerts": parsed.get("critical_alerts", []),
        "extracted_hud_metadata": parsed.get("extracted_hud_metadata", []),
        "disclaimer": parsed.get("disclaimer", "AI-assisted analysis. For clinician review only."),
        "raw": parsed,
    }

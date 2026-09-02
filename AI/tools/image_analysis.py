"""Image analysis tool — vision model via OpenAI / FreeLLMAPI for medical imaging interpretation.

Strict policy: Must strictly use real responses from the AI vision model.
No mock, template, or hardcoded diagnostic fallbacks are permitted.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.tools import tool

logger = logging.getLogger("medisync.image_analysis")

SUPPORTED_MODALITIES = frozenset({
    "xray", "chest_xray", "mri", "brain_mri", "ct", "ct_scan",
    "ultrasound", "obstetric_ultrasound", "fetal_ultrasound", "abdominal_ultrasound", "cardiac_echo",
    "pathology", "dermatology", "fundus", "general", "imaging", "other"
})

SYSTEM_PROMPT = """You are an expert AI Medical Imaging and Diagnostics Specialist for MediSync Hospital.
Analyze the provided medical image directly and thoroughly. Examine all visual anatomical structures, tissue echogenicity, density gradients, radiological landmarks, pathology, and any visible scan annotations/calipers.

You must output strict valid JSON matching this schema:
{
  "modality": "string (e.g., Obstetric / Fetal Ultrasound, Chest Radiograph, Brain MRI, CT Thorax)",
  "region": "string (e.g., Intrauterine / Fetal Anatomy, Thoracic / Pulmonary Compartment)",
  "impression": "string (comprehensive, detailed synthesis of primary clinical findings based strictly on the image)",
  "findings": [
    {
      "observation": "string",
      "location": "string",
      "severity": "Normal | Mild | Moderate | Severe | Critical",
      "confidence": "High | Medium | Low"
    }
  ],
  "differentials": [
    {
      "label": "string",
      "confidence": "High | Moderate | Low",
      "icd_code": "string",
      "description": "string"
    }
  ],
  "recommendations": ["string", "string"],
  "critical_alerts": ["string"],
  "disclaimer": "AI-assisted analysis. Not a clinical diagnosis. Clinician review and verification required."
}"""


@tool
def analyze_medical_image(
    image_url: str,
    modality: str = "other",
    clinical_context: str = "",
    detail: str = "high",
) -> str:
    """
    Analyze a medical image using multimodal AI vision model and return real clinical findings.

    Args:
        image_url: HTTPS URL or base64 data URI of the medical image.
        modality: Imaging modality ('obstetric_ultrasound', 'xray', 'mri', 'ct', 'ultrasound', 'dermatology', etc.).
        clinical_context: Clinical background, symptoms, or presenting complaint.
        detail: Vision detail level ('high' or 'low').

    Returns:
        JSON string with real structured findings from the AI vision model.
    """
    modality_norm = (modality or "imaging").lower().strip()

    from config.llm import get_vision_candidates

    candidates = get_vision_candidates()
    if not candidates:
        return json.dumps({
            "error": "No AI vision provider configured. Set GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or FREELLMAPI_API_KEY.",
            "modality": modality_norm,
            "findings": [],
            "impression": "No AI vision provider configured. Please set GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or FREELLMAPI_API_KEY in AI/.env.",
            "differentials": [],
            "recommendations": [],
            "critical_alerts": [],
            "disclaimer": "AI-assisted analysis. Not a clinical diagnosis.",
        }, ensure_ascii=False)

    context_prompt = (
        f"\nPatient Clinical Presentation & History: {clinical_context.strip()}"
        if clinical_context.strip()
        else ""
    )

    user_content = [
        {
            "type": "text",
            "text": (
                f"Perform a comprehensive medical analysis of this uploaded {modality_norm} scan. "
                f"Carefully inspect the image visually and describe the visible anatomical features, "
                f"diagnostic impressions, differential diagnoses with ICD-10 codes, and recommendations.{context_prompt}"
            ),
        },
        {
            "type": "image_url",
            "image_url": {"url": image_url, "detail": detail},
        },
    ]

    last_error = ""
    attempted_providers = []

    for provider_name, client, model_name in candidates:
        attempted_providers.append(f"{provider_name}:{model_name}")
        try:
            logger.info("Attempting AI vision analysis with provider=%s model=%s (modality=%s)", provider_name, model_name, modality_norm)

            # Some providers / older models don't support response_format={"type": "json_object"}
            call_kwargs: dict[str, Any] = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                "max_tokens": 2000,
            }
            response = None
            for attempt in range(2):
                try:
                    try:
                        response = client.chat.completions.create(
                            response_format={"type": "json_object"},
                            **call_kwargs,
                        )
                    except Exception as fmt_exc:
                        logger.debug("Provider %s failed with json_object format, retrying without format param: %s", provider_name, fmt_exc)
                        response = client.chat.completions.create(**call_kwargs)
                    break
                except Exception as call_exc:
                    err_str = str(call_exc)
                    if ("503" in err_str or "high demand" in err_str.lower() or "temporar" in err_str.lower()) and attempt == 0:
                        import time
                        logger.warning("Provider %s model %s returned 503/transient error: %s. Retrying in 1s...", provider_name, model_name, call_exc)
                        time.sleep(1.0)
                        continue
                    raise call_exc

            if not response:
                raise RuntimeError(f"No response received from {provider_name}:{model_name}")

            raw_content = response.choices[0].message.content or "{}"
            raw_content_clean = raw_content.strip()

            # Strip markdown code blocks ```json ... ``` if returned
            if raw_content_clean.startswith("```json"):
                raw_content_clean = raw_content_clean[7:]
            elif raw_content_clean.startswith("```"):
                raw_content_clean = raw_content_clean[3:]
            if raw_content_clean.endswith("```"):
                raw_content_clean = raw_content_clean[:-3]
            raw_content_clean = raw_content_clean.strip()

            # In case JSON is embedded within explanatory text
            if "{" in raw_content_clean and "}" in raw_content_clean:
                first_brace = raw_content_clean.find("{")
                last_brace = raw_content_clean.rfind("}")
                raw_content_clean = raw_content_clean[first_brace : last_brace + 1]

            result = json.loads(raw_content_clean)
            result.setdefault("disclaimer", "AI-assisted analysis. Not a clinical diagnosis. Clinician review and verification required.")
            result.setdefault("modality", modality_norm)
            result["provider_used"] = f"{provider_name}:{model_name}"

            # Extract HUD metadata from image if possible
            try:
                hud_data = _extract_hud_ocr(image_url)
                if hud_data:
                    result["extracted_hud_metadata"] = hud_data
            except Exception:
                pass

            logger.info("Successfully analyzed medical image with provider=%s model=%s", provider_name, model_name)
            return json.dumps(result, ensure_ascii=False)

        except Exception as exc:
            last_error = f"{provider_name} ({model_name}): {exc}"
            logger.warning("AI vision provider failed: %s. Attempting next candidate if available.", last_error)

    logger.error("All AI vision candidates failed. Attempted: %s. Last error: %s", attempted_providers, last_error)
    return json.dumps({
        "error": f"All vision providers failed ({', '.join(attempted_providers)}): {last_error}",
        "modality": modality_norm,
        "findings": [],
        "impression": f"AI Vision Model Error: {last_error}",
        "differentials": [],
        "recommendations": [],
        "critical_alerts": [],
        "disclaimer": "AI-assisted analysis. Not a clinical diagnosis.",
    }, ensure_ascii=False)


def _extract_hud_ocr(image_url: str) -> list[str]:
    """Extract visible HUD scan overlay annotations using OCR."""
    if not image_url or not isinstance(image_url, str):
        return []
    try:
        import base64
        import io
        from PIL import Image
        import pytesseract

        raw = image_url
        if "base64," in raw:
            raw = raw.split("base64,")[1]
        elif raw.startswith("http://") or raw.startswith("https://"):
            return []

        img_bytes = base64.b64decode(raw)
        img = Image.open(io.BytesIO(img_bytes))
        ocr_text = pytesseract.image_to_string(img)
        lines = [line.strip() for line in ocr_text.splitlines() if line.strip() and len(line.strip()) > 2]
        return lines[:10]
    except Exception:
        return []

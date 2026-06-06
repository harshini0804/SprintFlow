"""
AWS Lambda function — SprintFlow task refinement
Deploy: zip lambda_function.py && aws lambda update-function-code ...
Runtime: Python 3.11, handler: lambda_function.handler
Environment variable: ANTHROPIC_API_KEY or OPENAI_API_KEY
"""
import json
import os
import urllib.request
import urllib.error


def handler(event, context):
    prompt = event.get("prompt", "").strip()
    if not prompt:
        return {"suggestions": []}

    suggestions = _call_llm(prompt)
    return {"suggestions": suggestions}


def _call_llm(prompt: str) -> list[str]:
    """
    Calls Anthropic Claude API to generate 5 refined task titles.
    Falls back to rule-based suggestions if API key is not set.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return _fallback_suggestions(prompt)

    system = (
        "You are a project management assistant. "
        "Given a vague task description, generate exactly 5 refined, specific, "
        "actionable task titles. Return ONLY a JSON array of 5 strings. "
        "Each title should be clear, concise, and start with an action verb."
    )

    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 300,
        "system": system,
        "messages": [{"role": "user", "content": f"Refine this task: {prompt}"}],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read())
            text = body["content"][0]["text"].strip()
            # Parse the JSON array response
            suggestions = json.loads(text)
            if isinstance(suggestions, list):
                return [str(s) for s in suggestions[:5]]
    except Exception as e:
        print(f"LLM call failed: {e}")

    return _fallback_suggestions(prompt)


def _fallback_suggestions(prompt: str) -> list[str]:
    """Simple rule-based fallbacks when LLM is unavailable."""
    verbs = ["Implement", "Design", "Review", "Test", "Document"]
    return [f"{verb} {prompt}" for verb in verbs]

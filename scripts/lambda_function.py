"""
AWS Lambda function — SprintFlow task refinement using Groq API
Runtime: Python 3.11, handler: lambda_function.handler
Environment variable: GROQ_API_KEY
"""
import json
import os
import urllib.request
import urllib.error


def handler(event, context):
    prompt = event.get("prompt", "").strip()
    if not prompt:
        return {"suggestions": []}

    suggestions = _call_groq(prompt)
    return {"suggestions": suggestions}


def _call_groq(prompt: str) -> list[str]:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("No GROQ_API_KEY found, using fallback")
        return _fallback_suggestions(prompt)

    system = (
        "You are a project management assistant. "
        "Given a vague task description, generate exactly 5 refined, specific, "
        "actionable task titles. Return ONLY a valid JSON array of 5 strings, "
        "nothing else. No explanation, no markdown, no code fences — just the raw JSON array. "
        "Each title must be clear, concise, and start with an action verb. "
        "Example: [\"Fix null pointer in auth middleware\", \"Add unit tests for login flow\"]"
    )

    payload = json.dumps({
        "model": "llama-3.1-8b-instant",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Refine this task: {prompt}"}
        ],
        "temperature": 0.7,
        "max_tokens": 300,
    }).encode()

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "Mozilla/5.0 (compatible; SprintFlow/1.0)",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read())
            text = body["choices"][0]["message"]["content"].strip()
            print(f"Groq response: {text}")
            # Strip markdown code fences if present
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1]).strip()
            suggestions = json.loads(text)
            if isinstance(suggestions, list):
                return [str(s) for s in suggestions[:5]]
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"HTTP error {e.code}: {error_body}")
    except Exception as e:
        print(f"Groq call failed: {e}")

    return _fallback_suggestions(prompt)


def _fallback_suggestions(prompt: str) -> list[str]:
    verbs = ["Implement", "Design", "Review", "Test", "Document"]
    return [f"{verb} {prompt}" for verb in verbs]

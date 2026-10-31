def first_lines(text: str, count: int) -> str:
    """The first non-empty lines of `text`, each as a TOML comment."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()][:count]
    return "\n".join(f"# {ln}" for ln in lines)

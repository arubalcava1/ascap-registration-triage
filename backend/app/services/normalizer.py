import re
import unicodedata

from app.schemas import Party


BUSINESS_SUFFIXES = {
    "co",
    "company",
    "corp",
    "corporation",
    "inc",
    "llc",
    "ltd",
    "limited",
    "music",
    "publishing",
    "pub",
    "pubs",
}


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def normalize_title(title: str | None) -> str:
    text = normalize_text(title)
    if not text:
        return ""

    parts = text.split()
    if len(parts) > 1 and parts[-1] in {"the", "a", "an"}:
        parts = [parts[-1], *parts[:-1]]

    return " ".join(parts)


def normalize_name(name: str | None) -> str:
    return normalize_text(name)


def normalize_publisher_name(name: str | None) -> str:
    words = [word for word in normalize_text(name).split() if word not in BUSINESS_SUFFIXES]
    return " ".join(words)


def normalize_identifier(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-zA-Z0-9]", "", value).upper()


def normalize_ipi_cae(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\D", "", value)


def normalize_iswc(value: str | None) -> str:
    return normalize_identifier(value)


def normalized_party_names(parties: list[Party], *, publisher: bool = False) -> list[str]:
    normalize = normalize_publisher_name if publisher else normalize_name
    return [name for party in parties if (name := normalize(party.name))]


def normalized_ipis(parties: list[Party]) -> set[str]:
    return {ipi for party in parties if (ipi := normalize_ipi_cae(party.ipi_cae))}


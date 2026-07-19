from app.schemas import AscapWork, CandidateWork, Party
from app.services import writer_reference


def test_writer_reference_accepts_generic_title_writer_candidate_overlap(monkeypatch) -> None:
    def source_lookup(ascap_work, title):
        return ["Jane Blue", "Alex Stone", "Pat Reed"], "TestSource"

    monkeypatch.setattr(writer_reference, "_lookup_wikidata_writers", source_lookup)
    monkeypatch.setattr(writer_reference, "_lookup_wikipedia_writers", lambda ascap_work, title: ([], "Wikipedia"))
    monkeypatch.setattr(writer_reference, "_lookup_musicbrainz_writers", lambda ascap_work, title: ([], "MusicBrainz"))

    reference = writer_reference.lookup_external_writer_reference(
        AscapWork(title="Midnight Signal", writers=[Party(name="Stone")]),
        [
            CandidateWork(
                source="ASCAP Repertory",
                title="MIDNIGHT SIGNAL",
                writers=[
                    Party(name="BLUE JANE"),
                    Party(name="STONE ALEX"),
                    Party(name="REED PAT"),
                ],
            )
        ],
    )

    assert reference.status == "found"
    assert reference.sources == ["TestSource"]
    assert reference.writers == ["Jane Blue", "Alex Stone", "Pat Reed"]


def test_writer_reference_rejects_generic_wrong_same_title_reference(monkeypatch) -> None:
    def wrong_source_lookup(ascap_work, title):
        return ["Casey North", "Jordan West"], "TestSource"

    monkeypatch.setattr(writer_reference, "_lookup_wikidata_writers", wrong_source_lookup)
    monkeypatch.setattr(writer_reference, "_lookup_wikipedia_writers", lambda ascap_work, title: ([], "Wikipedia"))
    monkeypatch.setattr(writer_reference, "_lookup_musicbrainz_writers", lambda ascap_work, title: ([], "MusicBrainz"))

    reference = writer_reference.lookup_external_writer_reference(
        AscapWork(title="Midnight Signal", writers=[Party(name="Stone")]),
        [
            CandidateWork(
                source="ASCAP Repertory",
                title="MIDNIGHT SIGNAL",
                writers=[
                    Party(name="BLUE JANE"),
                    Party(name="STONE ALEX"),
                    Party(name="REED PAT"),
                ],
            )
        ],
    )

    assert reference.status == "found"
    assert reference.sources == ["Captured ASCAP public repertoire"]
    assert reference.writers == ["BLUE JANE", "STONE ALEX", "REED PAT"]


def test_maybe_lookup_uses_captured_reference_when_external_reference_misses_entered_writer(monkeypatch) -> None:
    def wrong_source_lookup(ascap_work, title):
        return ["Trey Anastasio", "Tom Marshall"], "TestSource"

    monkeypatch.setattr(writer_reference, "_lookup_wikidata_writers", wrong_source_lookup)
    monkeypatch.setattr(writer_reference, "_lookup_wikipedia_writers", lambda ascap_work, title: ([], "Wikipedia"))
    monkeypatch.setattr(writer_reference, "_lookup_musicbrainz_writers", lambda ascap_work, title: ([], "MusicBrainz"))

    reference = writer_reference.maybe_lookup_external_writer_reference(
        AscapWork(title="Part II", writers=[Party(name="Williams")]),
        [
            CandidateWork(
                source="ASCAP Repertory",
                title="PART II",
                writers=[
                    Party(name="MELDAL-JOHNSEN JUSTIN"),
                    Party(name="WILLIAMS HAYLEY NICHOLE"),
                    Party(name="YORK TAYLOR BENJAMIN"),
                ],
            )
        ],
    )

    assert reference is not None
    assert reference.status == "found"
    assert reference.sources == ["Captured ASCAP public repertoire"]
    assert reference.writers == [
        "MELDAL-JOHNSEN JUSTIN",
        "WILLIAMS HAYLEY NICHOLE",
        "YORK TAYLOR BENJAMIN",
    ]


def test_writer_reference_accepts_apostrophe_insensitive_writer_context(monkeypatch) -> None:
    def source_lookup(ascap_work, title):
        return ["Louis Bell", "She'yaa Bin Abraham-Joseph", "Travis Galette"], "TestSource"

    monkeypatch.setattr(writer_reference, "_lookup_wikidata_writers", source_lookup)
    monkeypatch.setattr(writer_reference, "_lookup_wikipedia_writers", lambda ascap_work, title: ([], "Wikipedia"))
    monkeypatch.setattr(writer_reference, "_lookup_musicbrainz_writers", lambda ascap_work, title: ([], "MusicBrainz"))

    reference = writer_reference.lookup_external_writer_reference(
        AscapWork(title="All My Friends", writers=[Party(name="sheyaa")]),
        [
            CandidateWork(
                source="ASCAP Repertory",
                title="ALL MY FRIENDS",
                writers=[
                    Party(name="BELL LOUIS RUSSELL"),
                    Party(name="BIN ABRAHAM-JOSEPH SHE'YAA"),
                    Party(name="GALETTE TRAVIS DYLAN"),
                ],
            )
        ],
    )

    assert reference.status == "found"
    assert reference.sources == ["TestSource"]
    assert reference.writers == ["Louis Bell", "She'yaa Bin Abraham-Joseph", "Travis Galette"]


def test_writer_reference_accepts_symbol_insensitive_writer_context(monkeypatch) -> None:
    def source_lookup(ascap_work, title):
        return ["P!nk", "Max Martin"], "TestSource"

    monkeypatch.setattr(writer_reference, "_lookup_wikidata_writers", source_lookup)
    monkeypatch.setattr(writer_reference, "_lookup_wikipedia_writers", lambda ascap_work, title: ([], "Wikipedia"))
    monkeypatch.setattr(writer_reference, "_lookup_musicbrainz_writers", lambda ascap_work, title: ([], "MusicBrainz"))

    reference = writer_reference.lookup_external_writer_reference(
        AscapWork(title="Example Hit", writers=[Party(name="pink")]),
        [
            CandidateWork(
                source="ASCAP Repertory",
                title="EXAMPLE HIT",
                writers=[
                    Party(name="P!NK"),
                    Party(name="MARTIN MAX"),
                ],
            )
        ],
    )

    assert reference.status == "found"
    assert reference.sources == ["TestSource"]
    assert reference.writers == ["P!nk", "Max Martin"]


def test_writer_reference_dedupes_equivalent_public_writer_names(monkeypatch) -> None:
    def source_lookup(ascap_work, title):
        return ["Bradley Nowell", "Bradley Nowell"], "TestSource"

    monkeypatch.setattr(writer_reference, "_lookup_wikidata_writers", source_lookup)
    monkeypatch.setattr(writer_reference, "_lookup_wikipedia_writers", lambda ascap_work, title: ([], "Wikipedia"))
    monkeypatch.setattr(writer_reference, "_lookup_musicbrainz_writers", lambda ascap_work, title: ([], "MusicBrainz"))

    reference = writer_reference.lookup_external_writer_reference(
        AscapWork(title="Badfish", writers=[Party(name="nowell")]),
        [
            CandidateWork(
                source="ASCAP Repertory",
                title="BADFISH",
                writers=[Party(name="NOWELL BRADLEY JAMES")],
            )
        ],
    )

    assert reference.status == "found"
    assert reference.sources == ["TestSource"]
    assert reference.writers == ["Bradley Nowell"]


def test_wikipedia_search_terms_prioritize_entered_writer_and_performer() -> None:
    terms = writer_reference._wikipedia_search_terms(
        AscapWork(
            title="All My Friends",
            performer="21 Savage",
            writers=[Party(name="She'yaa")],
        ),
        "All My Friends",
    )

    assert terms == [
        '"All My Friends" "she yaa" song',
        '"All My Friends" "21 Savage" song',
        '"All My Friends" song',
    ]


def test_wikidata_lookup_filters_by_entered_writer_context(monkeypatch) -> None:
    captured_query = ""

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"results": {"bindings": []}}

    def fake_get(url, params, headers, timeout):
        nonlocal captured_query
        captured_query = params["query"]
        return FakeResponse()

    monkeypatch.setattr(writer_reference.httpx, "get", fake_get)

    writers, source = writer_reference._lookup_wikidata_writers(
        AscapWork(title="All My Friends", writers=[Party(name="She'yaa")]),
        "All My Friends",
    )

    assert writers == []
    assert source == "Wikidata"
    assert 'CONTAINS(LCASE(?writerLabel), "she yaa")' in captured_query


def test_writer_reference_falls_back_to_captured_ascap_writers_when_apis_are_empty(monkeypatch) -> None:
    monkeypatch.setattr(writer_reference, "_lookup_wikidata_writers", lambda ascap_work, title: ([], "Wikidata"))
    monkeypatch.setattr(writer_reference, "_lookup_wikipedia_writers", lambda ascap_work, title: ([], "Wikipedia"))
    monkeypatch.setattr(writer_reference, "_lookup_musicbrainz_writers", lambda ascap_work, title: ([], "MusicBrainz"))

    reference = writer_reference.lookup_external_writer_reference(
        AscapWork(title="All My Friends", writers=[Party(name="sheyaa")]),
        [
            CandidateWork(
                source="ASCAP Repertory",
                title="ALL MY FRIENDS",
                writers=[
                    Party(name="BELL LOUIS RUSSELL"),
                    Party(name="BIN ABRAHAM-JOSEPH SHE'YAA"),
                    Party(name="GALETTE TRAVIS DYLAN"),
                ],
            ),
            CandidateWork(
                source="ASCAP Repertory",
                title="ALL MY FRIENDS",
                writers=[
                    Party(name="BELL LOUIS RUSSELL"),
                    Party(name="BIN ABRAHAM-JOSEPH SHE'YAA"),
                    Party(name="GALETTE TRAVIS DYLAN"),
                ],
            ),
        ],
    )

    assert reference.status == "found"
    assert reference.sources == ["Captured ASCAP public repertoire"]
    assert reference.writers == [
        "BELL LOUIS RUSSELL",
        "BIN ABRAHAM-JOSEPH SHE'YAA",
        "GALETTE TRAVIS DYLAN",
    ]


def test_writer_reference_fallback_prefers_larger_matching_captured_writer_set(monkeypatch) -> None:
    monkeypatch.setattr(writer_reference, "_lookup_wikidata_writers", lambda ascap_work, title: ([], "Wikidata"))
    monkeypatch.setattr(writer_reference, "_lookup_wikipedia_writers", lambda ascap_work, title: ([], "Wikipedia"))
    monkeypatch.setattr(writer_reference, "_lookup_musicbrainz_writers", lambda ascap_work, title: ([], "MusicBrainz"))

    reference = writer_reference.lookup_external_writer_reference(
        AscapWork(title="Santeria", writers=[Party(name="nowell")]),
        [
            CandidateWork(
                source="ASCAP Repertory",
                title="SANTERIA",
                writers=[
                    Party(name="BURNS DAIMON LASHON"),
                    Party(name="NOWELL BRADLEY JAMES"),
                ],
            ),
            CandidateWork(
                source="ASCAP Repertory",
                title="SANTERIA",
                writers=[
                    Party(name="GAUGH FLOYD I"),
                    Party(name="NOWELL BRADLEY JAMES"),
                    Party(name="WILSON ERIC JOHN"),
                ],
            ),
        ],
    )

    assert reference.status == "found"
    assert reference.sources == ["Captured ASCAP public repertoire"]
    assert reference.writers == [
        "GAUGH FLOYD I",
        "NOWELL BRADLEY JAMES",
        "WILSON ERIC JOHN",
    ]

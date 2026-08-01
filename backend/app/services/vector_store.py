"""
ChromaDB wrapper. Each project gets its own collection so sources from
different research projects never mix.
"""
import chromadb
from chromadb.utils import embedding_functions
try:
    from rank_bm25 import BM25Okapi
except Exception:  # pragma: no cover - optional until dependencies are installed
    BM25Okapi = None

from app.core.config import settings

_client = chromadb.PersistentClient(path=str(settings.chroma_dir))

_embedding_fn = embedding_functions.OpenAIEmbeddingFunction(
    api_key=settings.openai_api_key,
    model_name=settings.openai_embedding_model,
)


def get_collection(project_id: str):
    return _client.get_or_create_collection(
        name=f"project_{project_id}",
        embedding_function=_embedding_fn,
    )


def query_project(project_id: str, query: str, n_results: int = 6) -> list[dict]:
    """Returns list of {text, source_name, kind} for top matching chunks."""
    collection = get_collection(project_id)
    if collection.count() == 0:
        return []

    n_results = min(n_results, collection.count())
    results = collection.query(query_texts=[query], n_results=n_results)

    out = []
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    for doc, meta in zip(docs, metas):
        out.append({
            "text": doc,
            "source_name": meta.get("source_name", "unknown"),
            "kind": meta.get("kind", "unknown"),
        })
    return out


def query_project_multi(project_id: str, query: str, n_results: int = 10) -> list[dict]:
    """
    Hybrid retrieval required by the SRS:
    - semantic vector search from Chroma
    - BM25 lexical matching over project chunks
    - lightweight MMR-style diversification by source
    """
    semantic = query_project(project_id, query, n_results=max(4, n_results))
    for item in semantic:
        item["retrieval_method"] = "semantic"

    collection = get_collection(project_id)
    if collection.count() == 0:
        return []

    all_rows = collection.get(include=["documents", "metadatas"])
    docs = all_rows.get("documents", []) or []
    metas = all_rows.get("metadatas", []) or []
    bm25 = _bm25_rank(query, docs, metas, limit=n_results)
    diversified = _diversify_by_source(semantic + bm25, limit=n_results)
    return diversified[:n_results]


def _bm25_rank(query: str, docs: list[str], metas: list[dict], limit: int) -> list[dict]:
    tokens = [_tokenize(d) for d in docs]
    query_tokens = _tokenize(query)
    if not docs or not query_tokens:
        return []

    if BM25Okapi is not None:
        scores = BM25Okapi(tokens).get_scores(query_tokens)
    else:
        query_terms = set(query_tokens)
        scores = [sum(1 for tok in doc_tokens if tok in query_terms) for doc_tokens in tokens]

    ranked = sorted(enumerate(scores), key=lambda pair: pair[1], reverse=True)[:limit]
    out = []
    for idx, score in ranked:
        if score <= 0:
            continue
        meta = metas[idx] or {}
        out.append({
            "text": docs[idx],
            "source_name": meta.get("source_name", "unknown"),
            "kind": meta.get("kind", "unknown"),
            "retrieval_method": "bm25",
        })
    return out


def _diversify_by_source(items: list[dict], limit: int) -> list[dict]:
    seen_text = set()
    source_counts = {}
    first_pass = []
    overflow = []
    for item in items:
        fingerprint = item.get("text", "")[:240]
        if fingerprint in seen_text:
            continue
        seen_text.add(fingerprint)
        source = item.get("source_name", "unknown")
        if source_counts.get(source, 0) < 2:
            source_counts[source] = source_counts.get(source, 0) + 1
            item.setdefault("retrieval_method", "mmr")
            first_pass.append(item)
        else:
            overflow.append(item)
    return (first_pass + overflow)[:limit]


def _tokenize(text: str) -> list[str]:
    return [tok for tok in "".join(ch.lower() if ch.isalnum() else " " for ch in text).split() if len(tok) > 2]


def delete_source_chunks(project_id: str, source_id: str):
    collection = get_collection(project_id)
    collection.delete(where={"source_id": source_id})


def delete_project_collection(project_id: str):
    try:
        _client.delete_collection(name=f"project_{project_id}")
    except Exception:
        pass

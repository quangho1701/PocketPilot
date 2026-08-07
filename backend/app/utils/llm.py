"""LLM provider factory — swap between Bedrock and Gemini via LLM_PROVIDER env var."""

from app.config import settings

if settings.llm_provider == "gemini":
    from app.utils.gemini import GeminiClient, GeminiEmbeddingClient

    llm_client = GeminiClient()
    embedding_client = GeminiEmbeddingClient()
else:
    from app.utils.bedrock import BedrockClient, EmbeddingClient

    llm_client = BedrockClient()
    embedding_client = EmbeddingClient()

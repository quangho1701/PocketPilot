"""Shared AI provider factory for generation and embeddings."""

from app.config import settings

if settings.llm_provider == "gemini":
    from app.utils.gemini import GeminiClient, GeminiEmbeddingClient

    llm_client = GeminiClient()
    embedding_client = GeminiEmbeddingClient()
    embedding_model_id = settings.gemini_embedding_model_id
else:
    from app.utils.bedrock import BedrockClient, EmbeddingClient

    llm_client = BedrockClient()
    embedding_client = EmbeddingClient()
    embedding_model_id = settings.bedrock_embedding_model_id

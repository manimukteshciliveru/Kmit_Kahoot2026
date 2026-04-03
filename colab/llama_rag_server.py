# ============================================
# 🦙 LLaMA-3 RAG Server for Quiz Generation
# ============================================
# 
# HOW TO USE:
# 1. Open Google Colab (colab.research.google.com)
# 2. Change Runtime to GPU (Runtime > Change runtime type > T4 GPU)
# 3. Copy this entire script into a cell
# 4. Run the cell
# 5. Copy the ngrok URL printed at the end
# 6. Set COLAB_RAG_URL in your server .env file
# ============================================

import os
import json
import torch
import numpy as np
import faiss
import nest_asyncio
import uvicorn
import re
from typing import List, Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from pyngrok import ngrok

# Allow nested event loops (required for Colab)
nest_asyncio.apply()

# --- CONFIGURATION ---
MODEL_ID = "meta-llama/Meta-Llama-3-8B-Instruct"
HF_TOKEN = "YOUR_HF_TOKEN_HERE" # User should replace this or set as env
NGROK_TOKEN = "YOUR_NGROK_TOKEN_HERE" # User should replace this or set as env

# --- MODELS ---
print("🔄 Loading Embedding Model...")
embed_model = SentenceTransformer('all-MiniLM-L6-v2')

print("🔄 Loading LLaMA-3 (4-bit)...")
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4"
)

tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=HF_TOKEN)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    quantization_config=bnb_config,
    device_map="auto",
    token=HF_TOKEN
)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

print("✅ Models Loaded")

# --- RAG ENGINE ---
class RAGEngine:
    def __init__(self, embed_model):
        self.embed_model = embed_model
        self.index = None
        self.chunks = []
        
    def build(self, text):
        # Simple overlap chunking
        words = text.split()
        self.chunks = [' '.join(words[i:i+300]) for i in range(0, len(words), 200)]
        embeddings = self.embed_model.encode(self.chunks)
        self.index = faiss.IndexFlatL2(embeddings.shape[1])
        self.index.add(np.array(embeddings).astype('float32'))
        
    def retrieve(self, query, k=3):
        if not self.index: return []
        q_emb = self.embed_model.encode([query])
        D, I = self.index.search(np.array(q_emb).astype('float32'), k)
        return [self.chunks[i] for i in I[0] if i != -1]

rag = RAGEngine(embed_model)

# --- APP ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class GenRequest(BaseModel):
    content: str
    count: int = 10
    difficulty: str = "medium"
    type: str = "mcq"

@app.post("/generate")
async def generate(req: GenRequest):
    print(f"📥 Generating {req.count} {req.type} questions...")
    rag.build(req.content)
    context_chunks = rag.retrieve("Generate quiz questions", k=5)
    context = "\n---\n".join(context_chunks)
    
    prompt = f"""<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are a quiz generator. Output ONLY a valid JSON array of questions.
Format: [{{"text": "...", "options": ["...", "...", "...", "..."], "correctAnswer": "...", "explanation": "..."}}]
Use exactly {req.count} questions. Category: {req.difficulty}. Type: {req.type}.<|eot_id|>
<|start_header_id|>user<|end_header_id|>
CONTEXT:
{context}

Generate {req.count} quiz questions based on the context above.<|eot_id|>
<|start_header_id|>assistant<|end_header_id|>"""

    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    with torch.no_grad():
        outputs = model.generate(
            **inputs, 
            max_new_tokens=2048, 
            temperature=0.7, 
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )
    
    response = tokenizer.decode(outputs[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)
    
    # Try to extract JSON array
    try:
        json_match = re.search(r'\[.*\]', response, re.DOTALL)
        if json_match:
            questions = json.loads(json_match.group())
            return {"success": True, "questions": questions}
    except Exception as e:
        print(f"❌ JSON Parse Error: {e}")
        
    return {"success": False, "raw_response": response}

# --- LAUNCH ---
if __name__ == "__main__":
    if NGROK_TOKEN != "YOUR_NGROK_TOKEN_HERE":
        ngrok.set_auth_token(NGROK_TOKEN)
    
    public_url = ngrok.connect(8000).public_url
    print(f"\n🚀 COLAB SERVER LIVE AT: {public_url}")
    print(f"🔗 SET THIS AS 'COLAB_RAG_URL' IN YOUR .env\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)

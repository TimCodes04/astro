import os
import shutil
import uuid
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.utils.readers import parse_file, read_h5_with_schema
from app.utils.analysis import calculate_stats, filter_data, get_hierarchy_data
from app.utils.h5_scanner import scan_h5, detect_schema

app = FastAPI()

# CORS Configuration
# Production Security: Set ALLOWED_ORIGINS="https://your-app.web.app" in Cloud Run
# Default: "*" (Allow all)
origins_str = os.getenv("ALLOWED_ORIGINS", "*")
origins = [origin.strip() for origin in origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure directories
# Use environment variable for flexibility (Cloud Run/GCS compatibility)
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "app/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Templates
templates = Jinja2Templates(directory="app/templates")

os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/info", response_class=HTMLResponse)
async def read_info(request: Request):
    return templates.TemplateResponse("info.html", {"request": request})

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(('.hdf5', '.h5', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload .hdf5 or .csv")
    
    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_extension}")
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {str(e)}")
        
    return {"filename": file.filename, "file_id": file_id}

@app.post("/demo")
async def load_demo_data():
    """
    Generates (if needed) and loads the demo dataset.
    Simulates an upload process.
    """
    demo_filename = "demo_halo_catalog.h5"
    if not os.path.exists(demo_filename):
        # Generate it on demand
        import subprocess
        subprocess.run(["python3", "generate_realistic_catalog.py"], check=True)
        
    if not os.path.exists(demo_filename):
        raise HTTPException(status_code=500, detail="Failed to generate demo data")
        
    # Simulate Upload
    file_id = str(uuid.uuid4())
    destination = os.path.join(UPLOAD_DIR, f"{file_id}.h5")
    
    shutil.copy(demo_filename, destination)
    
    return {"filename": "Demo Data (NFW Cluster)", "file_id": file_id}

from app.utils.analysis import calculate_stats, filter_data
from typing import Optional

# --- New Schema-Agnostic Endpoints ---

from app.utils.h5_scanner import scan_h5, detect_schema
from app.utils.readers import read_h5_with_schema
from pydantic import BaseModel

class SchemaMap(BaseModel):
    mass: str
    pos: str
    id: str
    parent_id: Optional[str] = None
    radius: Optional[str] = None

# Simple in-memory cache for schemas
SCHEMA_CACHE = {}

@app.get("/stats/{file_id}")
async def get_stats(file_id: str):
    # Validate file_id is a UUID
    try:
        uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file ID")

    # Find file with this ID
    file_path = None
    for ext in ['.hdf5', '.h5', '.csv']:
        path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
        if os.path.exists(path):
            file_path = path
            break
            
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        # Use cached schema if available (for H5)
        if file_id in SCHEMA_CACHE and file_path.endswith(('.h5', '.hdf5')):
            data = read_h5_with_schema(file_path, SCHEMA_CACHE[file_id])
        else:
            data = parse_file(file_path)
            
        stats = calculate_stats(data)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating stats: {str(e)}")

@app.post("/scan/{file_id}")
async def scan_file(file_id: str):
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.h5")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        # Scan H5
        datasets = scan_h5(file_path)
        proposed_schema, _ = detect_schema(datasets)
        return {"datasets": datasets, "schema": proposed_schema}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest/{file_id}")
async def ingest_data(file_id: str, schema: SchemaMap):
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.h5")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        # Cache the schema for this file
        SCHEMA_CACHE[file_id] = schema.dict()
        
        # Validate reading
        data = read_h5_with_schema(file_path, SCHEMA_CACHE[file_id])
        return {"status": "success", "particle_count": len(data['mass'])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/hierarchy/{file_id}")
async def get_hierarchy(file_id: str, root_id: Optional[str] = None):
    # Validate file_id
    try:
        uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file ID")

    # Find file
    file_path = None
    for ext in ['.hdf5', '.h5']: # Hierarchy only for H5
        path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
        if os.path.exists(path):
            file_path = path
            break
    
    if not file_path:
        return []

    # touch_file(file_path) # Keep alive

    try:
        # Load schema from cache
        schema = SCHEMA_CACHE.get(file_id)
        if schema:
            data = read_h5_with_schema(file_path, schema)
        else:
            # Fallback
            data = parse_file(file_path)
            if 'parent_id' not in data:
                return []

        from app.utils.analysis import get_hierarchy_data
        nodes = get_hierarchy_data(data, root_id)
        return nodes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting hierarchy: {str(e)}")

@app.get("/data/{file_id}")
async def get_data(
    file_id: str,
    min_mass: Optional[float] = None,
    max_mass: Optional[float] = None,
    min_radius: Optional[float] = None,
    max_radius: Optional[float] = None,
    x_min: Optional[float] = None,
    x_max: Optional[float] = None,
    y_min: Optional[float] = None,
    y_max: Optional[float] = None,
    z_min: Optional[float] = None,
    z_max: Optional[float] = None
):
    # Validate file_id is a UUID
    try:
        uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file ID")

    # Find file
    file_path = None
    for ext in ['.hdf5', '.h5', '.csv']:
        path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
        if os.path.exists(path):
            file_path = path
            break
    
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        # Use cached schema if available (for H5)
        if file_id in SCHEMA_CACHE and file_path.endswith(('.h5', '.hdf5')):
            data = read_h5_with_schema(file_path, SCHEMA_CACHE[file_id])
        else:
            data = parse_file(file_path)
            
        # Apply Filters
        filters = {
            'min_mass': min_mass, 'max_mass': max_mass,
            'min_radius': min_radius, 'max_radius': max_radius,
            'x_min': x_min, 'x_max': x_max,
            'y_min': y_min, 'y_max': y_max,
            'z_min': z_min, 'z_max': z_max
        }
        filtered_data = filter_data(data, filters)
        
        return filtered_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing file: {str(e)}")

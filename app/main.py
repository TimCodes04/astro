from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import shutil
import os
import uuid
from typing import List

from app.utils.readers import parse_file
from app.utils.analysis import calculate_stats, filter_data

app = FastAPI(title="Halo Catalogue Visualizer")

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Templates
templates = Jinja2Templates(directory="app/templates")

UPLOAD_DIR = "app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

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

from app.utils.analysis import calculate_stats, filter_data
from typing import Optional

# ... (imports)

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
    # Validate file_id is a UUID to prevent path traversal
    try:
        uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file ID")

    # Find file with this ID (checking extensions)
    for ext in ['.hdf5', '.h5', '.csv']:
        path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
        if os.path.exists(path):
            try:
                data = parse_file(path)
                
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
    
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/stats/{file_id}")
async def get_stats(file_id: str):
    # Validate file_id is a UUID
    try:
        uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file ID")

    # Find file with this ID
    for ext in ['.hdf5', '.h5', '.csv']:
        path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
        if os.path.exists(path):
            try:
                data = parse_file(path)
                stats = calculate_stats(data)
                return stats
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error calculating stats: {str(e)}")
                
    raise HTTPException(status_code=404, detail="File not found")

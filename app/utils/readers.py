import h5py
import pandas as pd
import numpy as np
import os

def parse_file(file_path: str):
    """
    Parses HDF5 or CSV file and returns a dictionary of arrays.
    Expected columns/keys: x, y, z, mass (optional: radius)
    """
    data = {}
    
    if file_path.endswith(('.hdf5', '.h5')):
        with h5py.File(file_path, 'r') as f:
            # Determine base group
            base = f['PartType1'] if 'PartType1' in f else f
            
            # Helper to safely extract dataset as list
            def get_data(keys, default=None):
                for key in keys:
                    if key in base:
                        return base[key][:].tolist()
                return default

            # Coordinates
            if 'Coordinates' in base:
                coords = base['Coordinates'][:]
                if coords.shape[1] == 3:
                    data['x'], data['y'], data['z'] = coords[:, 0].tolist(), coords[:, 1].tolist(), coords[:, 2].tolist()
            else:
                data['x'] = get_data(['x'])
                data['y'] = get_data(['y'])
                data['z'] = get_data(['z'])

            data['mass'] = get_data(['Masses', 'mass', 'Mass'], default=[1.0] * len(data.get('x', [])))
            data['radius'] = get_data(['Radius', 'radius', 'r'])

    elif file_path.endswith('.csv'):
        df = pd.read_csv(file_path)
        df.columns = df.columns.str.lower().str.strip()
        
        if {'x', 'y', 'z'}.issubset(df.columns):
            data['x'] = df['x'].tolist()
            data['y'] = df['y'].tolist()
            data['z'] = df['z'].tolist()
        
        # Mass
        for col in ['mass', 'm', 'masses']:
            if col in df.columns:
                data['mass'] = df[col].tolist()
                break
        if 'mass' not in data:
             data['mass'] = [1.0] * len(data.get('x', []))

        # Radius
        for col in ['radius', 'r']:
            if col in df.columns:
                data['radius'] = df[col].tolist()
                break

    # Validation
    if 'x' not in data or not data['x']:
        raise ValueError("Could not find valid x, y, z coordinates in file.")
        
    return data

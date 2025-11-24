import h5py
import re

def scan_h5(file_path):
    """
    Recursively scans an H5 file and returns a list of all datasets.
    """
    datasets = []

    def visitor(name, node):
        if isinstance(node, h5py.Dataset):
            datasets.append({
                'path': name,
                'shape': node.shape,
                'dtype': str(node.dtype),
                'ndim': node.ndim
            })

    with h5py.File(file_path, 'r') as f:
        f.visititems(visitor)
    
    return datasets

def detect_schema(datasets):
    """
    Heuristically detects schema fields from a list of datasets.
    """
    schema = {
        'mass': None,
        'pos': None,
        'id': None,
        'parent_id': None,
        'radius': None
    }
    
    # Heuristic patterns (regex)
    patterns = {
        'mass': [r'mass', r'mvir', r'm200', r'weight'],
        'pos': [r'pos', r'coord', r'xyz', r'location'],
        'id': [r'id', r'index', r'number', r'track'],
        'parent_id': [r'parent', r'host', r'group'],
        'radius': [r'rad', r'r200', r'rvir', r'size']
    }

    # Scoring candidates
    candidates = {k: [] for k in schema.keys()}

    for ds in datasets:
        path_lower = ds['path'].lower()
        shape = ds['shape']
        ndim = ds['ndim']
        
        # Position must be (N, 3) or (3, N) - usually (N, 3)
        if ndim == 2 and (shape[1] == 3 or shape[0] == 3):
            candidates['pos'].append(ds)
            continue

        # Others are usually 1D (N,) or (N, 1)
        if ndim == 1 or (ndim == 2 and (shape[1] == 1 or shape[0] == 1)):
            # Check keywords
            for field, regex_list in patterns.items():
                if field == 'pos': continue # Already handled
                
                for pattern in regex_list:
                    if re.search(pattern, path_lower):
                        candidates[field].append(ds)
                        break
    
    # Select best candidates (simple first match for now, can be improved)
    for field in schema.keys():
        if candidates[field]:
            # Prefer exact matches or shortest path
            # For now, just take the first one found by regex
            schema[field] = candidates[field][0]['path']

    return schema, datasets

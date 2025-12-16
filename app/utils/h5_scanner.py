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
    
    # Heuristic patterns
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
        
        
        if ndim == 2 and (shape[1] == 3 or shape[0] == 3):
            candidates['pos'].append(ds)
            continue

        
        if ndim == 1 or (ndim == 2 and (shape[1] == 1 or shape[0] == 1)):
            # Check keywords
            for field, regex_list in patterns.items():
                if field == 'pos': continue # Already handled
                
                for pattern in regex_list:
                    if re.search(pattern, path_lower):
                        candidates[field].append(ds)
                        break
    
    # Select best candidates, simple first match for now
    for field in schema.keys():
        if candidates[field]:
            # Advanced Scoring System
            best_cand = None
            best_score = -999
            
            for cand in candidates[field]:
                score = 0
                path = cand['path'].lower()
                basename = path.split('/')[-1]
                
                # Base score: length penalty (prefer 'id' over 'particle_ids_long_name')
                score -= len(basename) * 0.5
                
                if field == 'id':
                    # Critical: Penalize likely parent fields
                    if 'parent' in path or 'host' in path or 'group' in path: 
                        score -= 50 
                    
                    if basename == 'id': score += 20
                    elif 'id' in basename: score += 10
                    elif 'index' in basename: score += 5
                    
                elif field == 'parent_id':
                    if 'parent' in basename: score += 20
                    elif 'host' in basename: score += 10
                    elif 'group' in basename: score += 5
                    
                elif field == 'mass':
                    if basename == 'mass': score += 20
                    elif 'mass' in basename: score += 10
                    
                elif field == 'pos':
                    if 'coord' in basename: score += 15
                    elif 'pos' in basename: score += 10
                    
                elif field == 'radius':
                    if 'radius' in basename: score += 20
                    elif 'r200' in basename: score += 15
                    elif 'vir' in basename: score += 10

                if best_cand is None or score > best_score:
                    best_score = score
                    best_cand = cand
            
            schema[field] = best_cand['path']

    return schema, datasets

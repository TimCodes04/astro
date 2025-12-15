import numpy as np
from scipy import stats

def filter_data(data: dict, filters: dict):
    """
    Filters the data dictionary based on provided ranges.
    Returns a new dictionary with filtered arrays.
    """

    count = len(data['x'])
    mask = np.ones(count, dtype=bool)
    
    # Convert lists to numpy arrays 
    # readers.py returns lists
    arrays = {k: np.array(v) for k, v in data.items()}
    
    # Apply filters
    if 'min_mass' in filters and filters['min_mass'] is not None:
        mask &= (arrays['mass'] >= filters['min_mass'])
    if 'max_mass' in filters and filters['max_mass'] is not None:
        mask &= (arrays['mass'] <= filters['max_mass'])
        
    if 'min_radius' in filters and filters['min_radius'] is not None and 'radius' in arrays:
        mask &= (arrays['radius'] >= filters['min_radius'])
    if 'max_radius' in filters and filters['max_radius'] is not None and 'radius' in arrays:
        mask &= (arrays['radius'] <= filters['max_radius'])

    # Spatial Slicing
    if 'x_min' in filters and filters['x_min'] is not None:
        mask &= (arrays['x'] >= filters['x_min'])
    if 'x_max' in filters and filters['x_max'] is not None:
        mask &= (arrays['x'] <= filters['x_max'])
        
    if 'y_min' in filters and filters['y_min'] is not None:
        mask &= (arrays['y'] >= filters['y_min'])
    if 'y_max' in filters and filters['y_max'] is not None:
        mask &= (arrays['y'] <= filters['y_max'])
        
    if 'z_min' in filters and filters['z_min'] is not None:
        mask &= (arrays['z'] >= filters['z_min'])
    if 'z_max' in filters and filters['z_max'] is not None:
        mask &= (arrays['z'] <= filters['z_max'])

    # Apply mask to all arrays
    filtered_data = {k: v[mask].tolist() for k, v in arrays.items()}
    return filtered_data

def calculate_stats(data: dict):
    """
    Calculates basic statistics for the halo catalog.
    """
    stats_output = {}
    
    mass = np.array(data.get('mass', []))
    x = np.array(data.get('x', []))
    y = np.array(data.get('y', []))
    z = np.array(data.get('z', []))
    # Radius might not exist in all files
    
    
    if len(mass) > 0:
        stats_output['total_particles'] = len(mass)
        stats_output['total_mass'] = float(np.sum(mass))
        stats_output['min_mass'] = float(np.min(mass))
        stats_output['max_mass'] = float(np.max(mass))
        stats_output['avg_mass'] = float(np.mean(mass))
        
        # Bounding Box
        stats_output['bbox'] = {
            'x_min': float(np.min(x)), 'x_max': float(np.max(x)),
            'y_min': float(np.min(y)), 'y_max': float(np.max(y)),
            'z_min': float(np.min(z)), 'z_max': float(np.max(z))
        }
        
        # Scientific Halo Mass Function (dN/dlogM)
        if stats_output['min_mass'] > 0:
            min_log_m = np.log10(stats_output['min_mass'])
            max_log_m = np.log10(stats_output['max_mass'])
            
            # Create bins (0.2 dex width or fixed number)
            bins = np.logspace(min_log_m, max_log_m, 25)
            
            counts, bin_edges = np.histogram(mass, bins=bins)
            
            # Calculate dlogM for normalization if needed
            # For "scientific" HMF, plot Number Density vs Mass. 
            
            bin_centers = 10**((np.log10(bin_edges[:-1]) + np.log10(bin_edges[1:])) / 2)
            
            stats_output['mass_function'] = {
                'counts': counts.tolist(),
                'bin_edges': bin_edges.tolist(),
                'bin_centers': bin_centers.tolist()
            }
            
            # Cumulative Mass Function (N(>M))
            cumulative_counts = np.cumsum(counts[::-1])[::-1]
            stats_output['cumulative_mass_function'] = {
                'counts': cumulative_counts.tolist(),
                'bin_centers': bin_centers.tolist()
            }
            
        else:
            # Fallback for non-positive mass
            hist, bin_edges = np.histogram(mass, bins=20)
            stats_output['mass_function'] = {
                'counts': hist.tolist(),
                'bin_edges': bin_edges.tolist(),
                'bin_centers': ((bin_edges[:-1] + bin_edges[1:]) / 2).tolist()
            }
            stats_output['cumulative_mass_function'] = None

        # Radius Histogram
        radius = np.array(data.get('radius', []))
        if len(radius) > 0:
            r_min, r_max = np.min(radius), np.max(radius)
            if r_max > r_min:
                r_bins = np.linspace(r_min, r_max, 20)
                r_hist, r_bin_edges = np.histogram(radius, bins=r_bins)
                r_bin_centers = (r_bin_edges[:-1] + r_bin_edges[1:]) / 2
                
                stats_output['radius_histogram'] = {
                    'counts': r_hist.tolist(),
                    'bin_centers': r_bin_centers.tolist()
                }

    return stats_output

def get_hierarchy_data(data, root_id=None):
    """
    Returns hierarchy data.
    If root_id is None, returns top-level halos (parent_id == -1).
    If root_id is provided, returns direct children of that halo.
    """
    ids = np.array(data['id'])
    parents = np.array(data['parent_id'])
    mass = np.array(data['mass'])
    
    # Ensure parents array exists
    if parents is None or len(parents) == 0:
        return []

    if root_id is None:
        # Find roots (parent_id == -1)
        mask = (parents == -1)
    else:
        # Find children of root_id
        mask = (parents == int(root_id))
        
    # Indices of matching halos
    indices = np.where(mask)[0]
    
    result = []
    for idx in indices:
        halo_id = int(ids[idx])
        # Check if this halo is a parent to anyone (has children)
        # For now, simple check: is halo_id in parents?
        has_children = halo_id in parents
        
        result.append({
            "id": halo_id,
            "mass": float(mass[idx]),
            "has_children": has_children
        })
        
    # Sort by mass descending
    result.sort(key=lambda x: x['mass'], reverse=True)
    return result

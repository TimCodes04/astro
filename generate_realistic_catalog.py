import h5py
import numpy as np

def generate_group_satellites(host_pos, r_vir, n_sats):
    """
    Generates a sparse cloud of satellites around a host.
    Wide orbit for line visibility.
    """
    pos = []
    # Place satellites in a shell between 0.3 R_vir and 1.0 R_vir
    # This guarantees lines are visible and don't overlap the host.
    min_dist = 0.3 * r_vir
    
    for _ in range(n_sats):
        # Random spherical direction
        theta = np.random.uniform(0, 2*np.pi)
        phi = np.random.uniform(0, np.pi)
        
        # Uniform distribution in Radius (not NFW) for maximum clarity
        r = np.random.uniform(min_dist, r_vir)
        
        px = r * np.sin(phi) * np.cos(theta)
        py = r * np.sin(phi) * np.sin(theta)
        pz = r * np.cos(phi)
        
        pos.append(np.array([px, py, pz]) + host_pos)
        
    return np.array(pos)

def generate_catalog(filename="demo_halo_catalog.h5"):
    print("Generating 'String of Pearls' Filament Demo...")
    
    # Storage
    all_mass = []
    all_radius = []
    all_pos = []
    all_parents = []
    ids = []
    
    current_id = 1
    
    # --- The Filament Backbone ---
    # A sine wave across the box
    # z = 50, y = 50 + 20*sin(x), x = 10..90
    n_groups = 25
    x_coords = np.linspace(10, 90, n_groups)
    
    for x in x_coords:
        # 1. Create the Host Group
        y = 50 + 20 * np.sin((x / 100.0) * 2 * np.pi) # Curve
        z = 50 + np.random.uniform(-5, 5) # Slight depth scatter
        
        host_pos = np.array([x, y, z])
        host_mass = 10**(np.random.uniform(13.0, 14.5)) # Group/Cluster mass
        host_rvir = (host_mass / 1e15)**(1/3) * 8.0 * 2.5 # Exaggerated radius for UI
        
        # Add Host
        all_mass.append(host_mass)
        all_radius.append(host_rvir)
        all_pos.append(host_pos)
        all_parents.append(-1)
        ids.append(current_id)
        
        host_id = current_id
        current_id += 1
        
        # 2. Add Satellites (15 to 30 per group)
        n_sats = np.random.randint(15, 31)
        sats_pos = generate_group_satellites(host_pos, host_rvir, n_sats)
        
        sats_mass = 10**(np.random.uniform(11.0, 12.0, n_sats))
        sats_rad = (sats_mass / 1e15)**(1/3) * 5.0 # Visible dots
        
        all_mass.extend(sats_mass)
        all_radius.extend(sats_rad)
        all_pos.extend(sats_pos)
        all_parents.extend([host_id] * n_sats)
        ids.extend(range(current_id, current_id + n_sats))
        current_id += n_sats
        
    # --- Background Noise (Field Halos) ---
    # Sparse background to provide context
    n_field = 500
    field_pos = np.random.rand(n_field, 3) * 100.0
    field_mass = 10**(np.random.uniform(10, 12, n_field))
    field_rad = (field_mass / 1e15)**(1/3) * 5.0
    
    all_mass.extend(field_mass)
    all_radius.extend(field_rad)
    all_pos.extend(field_pos)
    all_parents.extend([-1] * n_field)
    ids.extend(range(current_id, current_id + n_field))
    
    # Save
    with h5py.File(filename, 'w') as f:
        grp = f.create_group("Catalog")
        grp.create_dataset("Mass", data=np.array(all_mass))
        grp.create_dataset("Radius", data=np.array(all_radius))
        grp.create_dataset("Position", data=np.array(all_pos))
        grp.create_dataset("ParticleIDs", data=np.array(ids))
        grp.create_dataset("ParentID", data=np.array(all_parents))
        grp['Mass'].attrs['units'] = 'M_sun'
        
    print(f"Drafted {filename}: {n_groups} Groups with ~{20} subs each.")

if __name__ == "__main__":
    generate_catalog()

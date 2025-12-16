import h5py
import numpy as np

def generate_nfw_positions(n_particles, r_vir, c=10.0, center=np.array([0,0,0])):
    """
    Generate random positions following an NFW density profile.
    r_vir: Virial Radius
    c: Concentration parameter
    """
    pos = []
    # Rejection sampling max density proxy
    max_rho = 1.0 / ( (1.0/c) * (1 + 1.0/c)**2 )
    
    count = 0
    while count < n_particles:
        r = np.random.random() * r_vir
        x = r / (r_vir / c)
        rho = 1.0 / (x * (1+x)**2)
        
        if np.random.random() < (rho / max_rho):
            theta = np.random.uniform(0, 2*np.pi)
            phi = np.random.uniform(0, np.pi)
            
            px = r * np.sin(phi) * np.cos(theta)
            py = r * np.sin(phi) * np.sin(theta)
            pz = r * np.cos(phi)
            
            pos.append(np.array([px, py, pz]) + center)
            count += 1
            
    return np.array(pos)

def generate_catalog(filename="demo_halo_catalog.h5"):
    print("Generating realistic halo catalog...")
    
    # Constants
    # Box Size: 100 Mpc
    BOX_SIZE = 100.0 
    CENTER = np.array([50.0, 50.0, 50.0])
    
    # 1. Main Host Halo (Cluster)
    # Mass: 1e15 M_sun
    # Radius: ~2.5 Mpc
    host_mass = 1e15
    host_radius = 2.5
    
    # 2. Subhalos (Satellites)
    # 500 Subhalos orbiting the host
    # Mass: 1e10 - 1e12 M_sun
    n_subs = 500
    sub_masses = 10**(np.random.uniform(10, 12, n_subs))
    sub_radii = (sub_masses / 1e15)**(1/3) * host_radius * 10 # Scaling approx
    
    # Positions: Distributed within Host R_vir (NFW-like distribution for satellites too)
    sub_positions = generate_nfw_positions(n_subs, r_vir=host_radius, c=3.0, center=CENTER)
    
    # 3. Field Halos
    # 2000 halos scattered in the box
    n_field = 2000
    field_masses = 10**(np.random.uniform(9, 13, n_field))
    field_radii = (field_masses / 1e15)**(1/3) * host_radius * 10
    field_positions = np.random.rand(n_field, 3) * BOX_SIZE
    
    # --- Assembly ---
    
    # IDs: START AT 1 to avoid Javascript "ID 0 is False" bug
    # Host: ID 1
    # Subs: ID 2..501
    # Field: ID 502..2501
    
    # Host is represented as a single massive particle for simplicity in this catalog view
    # (Or use the center point)
    all_mass = np.concatenate([[host_mass], sub_masses, field_masses])
    all_radius = np.concatenate([[host_radius], sub_radii, field_radii])
    all_pos = np.vstack([CENTER, sub_positions, field_positions])
    
    all_ids = np.arange(1, len(all_mass) + 1)
    
    # Parents logic:
    # Host (ID 1): Parent -1 (Root)
    # Subs (ID 2..501): Parent 1 (The Host)
    # Field: Parent -1 (Roots)
    all_parents = np.full(len(all_mass), -1, dtype=np.int32)
    
    # Set parents for subhalos (Indices 1 to 500 -> Parent is ID 1)
    # Note: Parent ID is 1.
    all_parents[1:n_subs+1] = 1 
    
    # Save to H5
    with h5py.File(filename, 'w') as f:
        grp = f.create_group("Catalog")
        
        # Using standard names to ensure Scanner compatibility
        grp.create_dataset("Mass", data=all_mass)
        grp.create_dataset("Radius", data=all_radius)
        grp.create_dataset("Position", data=all_pos)
        grp.create_dataset("ParticleIDs", data=all_ids)
        grp.create_dataset("ParentID", data=all_parents)
        
        # Add Units Attribute
        grp['Mass'].attrs['units'] = 'M_sun'
        grp['Radius'].attrs['units'] = 'Mpc'
        grp['Position'].attrs['units'] = 'Mpc'
        
    print(f"Drafted {filename} with:")
    print(f" - 1 Host Cluster (ID 1, M={host_mass:.1e})")
    print(f" - {n_subs} Satellites (Child of ID 1)")
    print(f" - {n_field} Field Halos")
    print("IDs start at 1 to prevent JS null/false ambiguity.")

if __name__ == "__main__":
    generate_catalog()

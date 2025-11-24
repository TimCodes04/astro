import h5py
import numpy as np

# Create a comprehensive dummy HDF5 file
filename = 'comprehensive_test.h5'

with h5py.File(filename, 'w') as f:
    # Create a group (optional, but good for testing robust parser)
    grp = f.create_group("PartType1")
    
    # 1000 random particles for better stats
    n_particles = 1000
    
    # Coordinates: 0 to 100 box
    coords = np.random.rand(n_particles, 3) * 100 
    
    # Masses: Log-normal distribution to look like a real HMF (approx)
    # Mean log mass 10, sigma 1
    log_mass = np.random.normal(10, 1, n_particles)
    masses = 10**log_mass
    
    # Radius: Correlated with mass (R ~ M^(1/3)) plus scatter
    # R ~ M^(1/3) * const
    radius = (masses ** (1/3)) * 0.1 
    # Add scatter
    radius = radius * np.random.normal(1, 0.2, n_particles)
    
    grp.create_dataset("Coordinates", data=coords)
    grp.create_dataset("Masses", data=masses)
    grp.create_dataset("Radius", data=radius)
    
print(f"Created {filename}")

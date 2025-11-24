import h5py
import numpy as np

# Create a debug HDF5 file with very clear data for histograms
filename = 'debug_data.h5'

with h5py.File(filename, 'w') as f:
    # Create a group
    grp = f.create_group("PartType1")
    
    n_particles = 1000
    
    # Coordinates: 0 to 100
    coords = np.random.rand(n_particles, 3) * 100 
    
    # Masses: Uniform log distribution from 10^10 to 10^15
    # This guarantees we span the bins
    log_mass = np.linspace(10, 15, n_particles)
    masses = 10**log_mass
    
    # Radius: Uniform distribution from 10 to 200 kpc
    # This guarantees we span the bins
    radius = np.linspace(10, 200, n_particles)
    
    grp.create_dataset("Coordinates", data=coords)
    grp.create_dataset("Masses", data=masses)
    grp.create_dataset("Radius", data=radius)
    
print(f"Created {filename} with {n_particles} particles.")
print(f"Mass range: {masses.min():.2e} - {masses.max():.2e}")
print(f"Radius range: {radius.min():.2f} - {radius.max():.2f}")

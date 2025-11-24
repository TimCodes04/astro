import h5py
import numpy as np

# Create a dummy HDF5 file
with h5py.File('test_data.h5', 'w') as f:
    # Create a group (optional, but good for testing robust parser)
    grp = f.create_group("PartType1")
    
    # 100 random particles
    n_particles = 100
    coords = np.random.rand(n_particles, 3) * 100 # 0 to 100 box
    masses = np.random.rand(n_particles) * 10 + 1 # 1 to 11 mass
    
    grp.create_dataset("Coordinates", data=coords)
    grp.create_dataset("Masses", data=masses)
    
print("Created test_data.h5")

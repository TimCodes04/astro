import h5py
import numpy as np

def generate_custom_h5(filename="custom_halo_catalog.h5", n_halos=100):
    with h5py.File(filename, 'w') as f:
        # Create a non-standard group structure
        g1 = f.create_group("StrangeGroup")
        g2 = f.create_group("Hidden")
        g3 = f.create_group("IDs")
        g4 = f.create_group("Meta")

        # Mass: Log-normal distribution
        mass = np.random.lognormal(10, 1, n_halos)
        g1.create_dataset("UnknownMass", data=mass)

        # Position: Random 3D coordinates
        pos = np.random.rand(n_halos, 3) * 100
        g2.create_dataset("SecretCoords", data=pos)

        # IDs: Sequential integers
        ids = np.arange(n_halos, dtype=np.int64)
        g3.create_dataset("TheRealIDs", data=ids)

        # Parent IDs: Random hierarchy (some roots, some children)
        # -1 indicates a root halo
        parents = np.full(n_halos, -1, dtype=np.int64)
        # Make last 50 halos children of the first 50
        parents[50:] = np.random.randint(0, 50, 50)
        g4.create_dataset("ParentLink", data=parents)

        # Radius: Random
        radius = np.random.rand(n_halos) * 2
        g1.create_dataset("Radii", data=radius)

        print(f"Generated {filename} with {n_halos} halos.")
        print("Structure:")
        print("  StrangeGroup/UnknownMass (Mass)")
        print("  StrangeGroup/Radii (Radius)")
        print("  Hidden/SecretCoords (Position)")
        print("  IDs/TheRealIDs (ID)")
        print("  Meta/ParentLink (Parent ID)")

if __name__ == "__main__":
    generate_custom_h5()

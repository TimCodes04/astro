Dear Coders,

This is a somewhat messy repository and I will try to explain some things about the application. I am also working on hosting it and it will be available shortly under halo-tool.com.
The app folder contains both frontend and backend elements. Most importantly it contains /utils which is home to the h5_scanner.py which can automatically scan .h5 files and 
match data to mass, radius etc.. Therefore the app can read all kinds of .h5 files no matter the structure. The file analysis.py is obviously where all the analysis happens.
Much of this code was either wrote or debugged using AI and I made sure there are a lot of comments to enhance understanding. 

If you want to run this locally in your browser, you will find all necessary requirements in requirements.txt and some example datasets like custom_halo_catalog.h5 to test the app. 
To run, use uvicorn as indicated in requirements.txt.
I will add more info to this README shortly!

This is very much my first big project and it contains a lot of messy, bad code. So if you just want the end result, visit halo-tool.com (hopefully reachable before 2026 kicks off).

Thanks!
T

## Local Setup

### 1. Prerequisites
- Python 3.8+
- nodejs (optional, only if you want to modify frontend dependencies, otherwise raw JS is used)

### 2. Installation

```bash
# Clone the repository
git clone <https://github.com/TimCodes04/astro>
cd astro

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Running the App

Start the FastAPI backend server:

```bash
uvicorn app.main:app --reload
```

Then open your browser to: **http://127.0.0.1:8000**



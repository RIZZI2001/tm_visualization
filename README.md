# tm_visualization
Masters thesis project

# Step 1 (DATA formating, structure and topic generation)

<data_set> refers to the general name of the dataset (e.g. 16s).

in the 'server' folder next to 'scripts' and 'static' put a folder called 'DATA' containing the folders 'Input' and 'Output'.
In the 'Input' folder put a folder: <data_set>. In it, place your input data: metadata.csv, otus.csv and taxonomy.csv. 

Install the required packages in requirements.txt.

Open the 'topic_gen.py' script in the 'scripts' folder. 
    -   Set the DATASET_NAME to <data_set>
    -   Edit the TAXONOMY_LEVELS and METADAT_ATTRS to the desired specificytion (eg. remove 'phylum' level from 18s data set)

At the bottom is a main function that calls:
    -   sites_generation() to generate the sites.csv in the Input/<data_set> folder (helper set, subset of metadata for better efficiency).
    -   taxonomy_levels_generation() to generate hierarchical json of taxonomy levels (unused for now)
    -   topic_generation(dim) to generate a topic set for 'dim' topics of the dataset.

Also calls these functions for the spearman correlation
    -   metadata_otu_correlation_generation()
    -   metadata_metadata_correlation_generation()
    -   metadata_topic_correlation_generation(dim)
    -   topic_topic_correlation_generation(dim)

Set the range of dimensions to a desired range and execute the script.

In the Output folder a subfolder of the dataset name with subfolders: TM_Components TM_Topics and Correlation containing the csv files gets generated.

# Step 2 hosting the API
Go to the root directory of this project in your command line e.g. 'topic-modeling' and launch the API with this command:

python -m uvicorn server.scripts.api:app --reload --host 127.0.0.1 --port 8000

open your browser and navigate to: http://127.0.0.1:8000/static/index.html.

In the options (top right) set Data Set as your <data-set>
You can also change other options there.

server
├── scripts
│   ├── api.py
│   ├── helper_functions.py
│   └── ...
├── static
│   ├── index.html
│   ├── app.js
│   ├── helper_functions.js
│   └── ...
└── DATA
    ├── Input
    │   ├── 16s
    │   │   ├── metadata.csv
    │   │   ├── otus.csv
    │   │   ├── sites.csv
    │   │   └── taxonomy.csv
    │   └── 18s
    │   │   ├── metadata.csv
    │   │   └── ...
    └── Output
        ├── 16s
        │   ├── Correlation
        │   │   ├── md_top
        │   │   │   ├── 2_md_top_correlation.csv
        │   │   │   └── ...
        │   │   ├── top_top
        │   │   │   ├── 2_top_top_correlation.csv
        │   │   │   └── ...
        │   │   ├── md_md_correlation.csv
        │   │   └── md_otu_correlation.csv
        │   ├── TM_Components
        │   │   ├── 2_components.csv
        │   │   └── ...
        │   ├── TM_Topics
        │   │   ├── 2_topics.csv
        │   │   └── ...
        │   └── taxonomy_levels.json
        └── 18s
            ├── Correlation
            │   └── ...
            └── ...
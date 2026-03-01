import pandas as pd
import os
import json
from scipy.stats import pearsonr
import numpy as np
import _pickle as cPickle
from sklearn.decomposition import NMF
from pathlib import Path

# base dir (the `server` folder)
# For scripts under `server/scripts`, parents[1] yields the `server` directory.
BASE_DIR = Path(__file__).resolve().parents[1]
INPUT_FOLDER = BASE_DIR / 'DATA' / 'Input'
OUTPUT_FOLDER = BASE_DIR / 'DATA' / 'Output'
OUTPUT_TM_COMPONENTS = 'TM_Components'
OUTPUT_TM_TOPICS = 'TM_Topics'

DATASET_NAME = '16s'
TAXONOMY_LEVELS = ["biodomain", "phylum", "class", "bioorder", "family", "genus", "name"]
METADATA_ATTRS = ["PO4", "NOx", "NH4", "NO2", "NO3", "temperature", "salinity", "Chl_a", "Phaeo", "Chl_a_conc", "f0", "fa"]

def NNMF_on_microbiome_data(dataframe_in, dimensionality):
    """ Non-negative Matrix Factorization (NNMF) on microbiome data
    :param dataframe_in: The input microbiome data set (e.g. 16S, 18S,..)
    :param dimensionality: The number of topics (k))
    :return: The fitted NNMF model, the NNMF defined topics, the contributing components (OTUs)
    of each topic
    """
    nnmf_model = NMF(n_components=dimensionality, init='random', random_state=0, max_iter=10000)
    nnmf_topics = nnmf_model.fit_transform(dataframe_in)
    nnmf_components = nnmf_model.components_
    nnmf_topics = pd.DataFrame(nnmf_topics)
    nnmf_components = pd.DataFrame(nnmf_components, columns=dataframe_in.columns)
    return nnmf_model, nnmf_topics, nnmf_components


# Dimensionality reduction function
def topic_generation(dimensionality):
    print("Starting Topic Modeling with dimensionality: ", dimensionality)
    # Load and prepare data: use samples and sample IDs already present in the input data
    df = pd.read_csv(str(INPUT_FOLDER / DATASET_NAME / f'otus.csv'), sep=',', index_col=0, header=0)
    df = df.fillna(0)
    # Topic Modeling
    nnmf_model, nnmf_topics, nnmf_components = NNMF_on_microbiome_data(df, dimensionality)
    # Save the NNMF topics, components and model

    # create output folder structure: output_folder/<data_set>/{TM_Components,TM_Topics}
    output_base = os.path.join(str(OUTPUT_FOLDER), DATASET_NAME)
    topics_dir = os.path.join(output_base, OUTPUT_TM_TOPICS)
    components_dir = os.path.join(output_base, OUTPUT_TM_COMPONENTS)
    os.makedirs(topics_dir, exist_ok=True)
    os.makedirs(components_dir, exist_ok=True)

    # set topics index from input data and write outputs into their respective folders
    nnmf_topics.index = df.index
    topics_path = os.path.join(topics_dir, f"{dimensionality}_topics.csv")
    components_path = os.path.join(components_dir, f"{dimensionality}_components.csv")

    nnmf_topics.to_csv(topics_path)
    nnmf_components.to_csv(components_path)

def sites_generation():
    metadata_df = pd.read_csv(str(INPUT_FOLDER / DATASET_NAME / 'metadata.csv'))

    highest_location_id = metadata_df['location_id'].max()
    lowest_location_id = metadata_df['location_id'].min()

    # Collect location data
    locations_data = []
    for id in range(lowest_location_id, highest_location_id + 1):
        location_rows = metadata_df[metadata_df['location_id'] == id]
        if not location_rows.empty:
            rough_lat_long = location_rows['rough_lat_long'].values[0]
            location_name = location_rows['location_name'].values[0]
            locations_data.append({
                'location_id': id,
                'rough_lat_long': rough_lat_long,
                'location_name': location_name
            })
    
    # Write to CSV file
    sites_df = pd.DataFrame(locations_data)
    sites_output_path = INPUT_FOLDER / DATASET_NAME / 'sites.csv'
    sites_df.to_csv(str(sites_output_path), index=False)
    print(f"Sites data written to {sites_output_path}")

def metadata_otu_correlation_generation():
    print("Starting Metadata-OTU Correlation Calculation")
    metadata = pd.read_csv(f'{INPUT_FOLDER}/{DATASET_NAME}/metadata.csv', index_col=0)
    otus = pd.read_csv(f'{INPUT_FOLDER}/{DATASET_NAME}/otus.csv', index_col=0)

    common_keys = metadata.index.intersection(otus.index)

    # Align both dataframes by common keys
    metadata_aligned = metadata.loc[common_keys, METADATA_ATTRS].copy()
    otus_aligned = otus.loc[common_keys].copy()

    # Convert to numeric, replacing 'NA' or other non-numeric values with NaN
    metadata_aligned = metadata_aligned.apply(pd.to_numeric, errors='coerce')
    otus_aligned = otus_aligned.apply(pd.to_numeric, errors='coerce')

    # Calculate correlations: rows = metadata attributes, columns = otus
    otu_cols = [str(col) for col in otus_aligned.columns]

    correlation_matrix = pd.DataFrame(index=METADATA_ATTRS, columns=otu_cols)

    for attr in METADATA_ATTRS:
        time_before = os.times()
        for otu_str in otu_cols:
            # Get valid pairs (non-NaN in both)
            valid_mask = metadata_aligned[attr].notna() & otus_aligned[otu_str].notna()
            if valid_mask.sum() >= 3:  # Need at least 3 valid pairs for correlation
                corr, _ = pearsonr(metadata_aligned.loc[valid_mask, attr], 
                                otus_aligned.loc[valid_mask, otu_str])
                correlation_matrix.loc[attr, otu_str] = corr
            else:
                correlation_matrix.loc[attr, otu_str] = np.nan
        time_after = os.times()
        print(f"Completed correlations for attribute {attr} in {time_after.user - time_before.user} seconds.")

    # Convert to numeric
    correlation_matrix = correlation_matrix.apply(pd.to_numeric, errors='coerce')

    # Save the metadata-topic correlation result
    output_path = f'{OUTPUT_FOLDER}/{DATASET_NAME}/Correlation/md_otu_correlation.csv'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    correlation_matrix.to_csv(output_path)

def metadata_metadata_correlation_generation():
    print("Starting Metadata-Metadata Correlation Calculation")
    metadata = pd.read_csv(f'{INPUT_FOLDER}/{DATASET_NAME}/metadata.csv', index_col=0)
    
    # Select only metadata attributes and convert to numeric
    metadata_aligned = metadata[METADATA_ATTRS].copy()
    metadata_aligned = metadata_aligned.apply(pd.to_numeric, errors='coerce')
    
    # Create correlation matrix
    correlation_matrix = pd.DataFrame(index=METADATA_ATTRS, columns=METADATA_ATTRS)
    
    for attr1 in METADATA_ATTRS:
        for attr2 in METADATA_ATTRS:
            if attr1 == attr2:
                # Set same attribute correlation to 1
                correlation_matrix.loc[attr1, attr2] = 1.0
            else:
                # Get valid pairs (non-NaN in both)
                valid_mask = metadata_aligned[attr1].notna() & metadata_aligned[attr2].notna()
                if valid_mask.sum() >= 3:  # Need at least 3 valid pairs for correlation
                    corr, _ = pearsonr(metadata_aligned.loc[valid_mask, attr1], 
                                    metadata_aligned.loc[valid_mask, attr2])
                    correlation_matrix.loc[attr1, attr2] = corr
                else:
                    correlation_matrix.loc[attr1, attr2] = np.nan
    
    # Convert to numeric
    correlation_matrix = correlation_matrix.apply(pd.to_numeric, errors='coerce')
    
    # Save the metadata-metadata correlation result
    output_path = f'{OUTPUT_FOLDER}/{DATASET_NAME}/Correlation/md_md_correlation.csv'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    correlation_matrix.to_csv(output_path)

def metadata_topic_correlation_generation(topicSet):
    print("Starting Metadata-Topic Correlation Calculation for topic set: ", topicSet)
    metadata = pd.read_csv(f'{INPUT_FOLDER}/{DATASET_NAME}/metadata.csv', index_col=0)
    topics = pd.read_csv(f'{OUTPUT_FOLDER}/{DATASET_NAME}/TM_Topics/{topicSet}_topics.csv', index_col=0)

    common_keys = metadata.index.intersection(topics.index)

    # Align both dataframes by common keys
    metadata_aligned = metadata.loc[common_keys, METADATA_ATTRS].copy()
    topics_aligned = topics.loc[common_keys].copy()

    # Convert to numeric, replacing 'NA' or other non-numeric values with NaN
    metadata_aligned = metadata_aligned.apply(pd.to_numeric, errors='coerce')
    topics_aligned = topics_aligned.apply(pd.to_numeric, errors='coerce')

    # Calculate correlations: rows = metadata attributes, columns = topics (0-topicSet-1)
    topic_cols = [str(col) for col in range(topicSet)]

    correlation_matrix = pd.DataFrame(index=METADATA_ATTRS, columns=topic_cols)

    for attr in METADATA_ATTRS:
        for topic_str in topic_cols:
            # Get valid pairs (non-NaN in both)
            valid_mask = metadata_aligned[attr].notna() & topics_aligned[topic_str].notna()
            if valid_mask.sum() >= 3:  # Need at least 3 valid pairs for correlation
                corr, _ = pearsonr(metadata_aligned.loc[valid_mask, attr], 
                                topics_aligned.loc[valid_mask, topic_str])
                correlation_matrix.loc[attr, topic_str] = corr
            else:
                correlation_matrix.loc[attr, topic_str] = np.nan

    # Convert to numeric
    correlation_matrix = correlation_matrix.apply(pd.to_numeric, errors='coerce')

    # Save the metadata-topic correlation result
    output_path = f'{OUTPUT_FOLDER}/{DATASET_NAME}/Correlation/md_top/{topicSet}_md_top_correlation.csv'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    correlation_matrix.to_csv(output_path)

def topic_topic_correlation_generation(topicSet):
    print("Starting Topic-Topic Correlation Calculation for topic set: ", topicSet)
    topics = pd.read_csv(f'{OUTPUT_FOLDER}/{DATASET_NAME}/TM_Topics/{topicSet}_topics.csv', index_col=0)

    # Convert to numeric, replacing 'NA' or other non-numeric values with NaN
    topics_aligned = topics.apply(pd.to_numeric, errors='coerce')

    # Calculate topic-to-topic correlations
    topic_cols = [str(col) for col in range(topicSet)]
    correlation_matrix = pd.DataFrame(index=topic_cols, columns=topic_cols)

    for topic1_str in topic_cols:
        for topic2_str in topic_cols:
            if topic1_str == topic2_str:
                # Set same topic correlation to 1
                correlation_matrix.loc[topic1_str, topic2_str] = 1.0
            else:
                # Get valid pairs (non-NaN in both topics)
                valid_mask = topics_aligned[topic1_str].notna() & topics_aligned[topic2_str].notna()
                if valid_mask.sum() >= 3:  # Need at least 3 valid pairs for correlation
                    corr, _ = pearsonr(topics_aligned.loc[valid_mask, topic1_str], 
                                    topics_aligned.loc[valid_mask, topic2_str])
                    correlation_matrix.loc[topic1_str, topic2_str] = corr
                else:
                    correlation_matrix.loc[topic1_str, topic2_str] = np.nan

    # Convert to numeric
    correlation_matrix = correlation_matrix.apply(pd.to_numeric, errors='coerce')

    # Save the topic-topic correlation result
    output_path = f'{OUTPUT_FOLDER}/{DATASET_NAME}/Correlation/top_top/{topicSet}_top_top_correlation.csv'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    correlation_matrix.to_csv(output_path)

def inter_topicSet_correlation_generation(topicSet1, topicSet2):
    print("Starting Inter-TopicSet Correlation Calculation for topic sets: ", topicSet1, "and", topicSet2)
    topics1 = pd.read_csv(f'{OUTPUT_FOLDER}/{DATASET_NAME}/TM_Topics/{topicSet1}_topics.csv', index_col=0)
    topics2 = pd.read_csv(f'{OUTPUT_FOLDER}/{DATASET_NAME}/TM_Topics/{topicSet2}_topics.csv', index_col=0)

    common_keys = topics1.index.intersection(topics2.index)

    # Align both dataframes by common keys
    topics1_aligned = topics1.loc[common_keys].copy()
    topics2_aligned = topics2.loc[common_keys].copy()

    # Convert to numeric, replacing 'NA' or other non-numeric values with NaN
    topics1_aligned = topics1_aligned.apply(pd.to_numeric, errors='coerce')
    topics2_aligned = topics2_aligned.apply(pd.to_numeric, errors='coerce')

    # Calculate correlations: rows = topics from topicSet1, columns = topics from topicSet2
    topic1_cols = [str(col) for col in range(topicSet1)]
    topic2_cols = [str(col) for col in range(topicSet2)]

    correlation_matrix = pd.DataFrame(index=topic1_cols, columns=topic2_cols)

    for topic1_str in topic1_cols:
        for topic2_str in topic2_cols:
            # Get valid pairs (non-NaN in both topics)
            valid_mask = topics1_aligned[topic1_str].notna() & topics2_aligned[topic2_str].notna()
            if valid_mask.sum() >= 3:  # Need at least 3 valid pairs for correlation
                # use cosine similarity instead of pearson correlation for inter-topicSet correlation
                corr = np.dot(
                    topics1_aligned.loc[valid_mask, topic1_str], 
                    topics2_aligned.loc[valid_mask, topic2_str]) / (np.linalg.norm(topics1_aligned.loc[valid_mask, topic1_str]) * np.linalg.norm(topics2_aligned.loc[valid_mask, topic2_str])
                )
                correlation_matrix.loc[topic1_str, topic2_str] = corr
            else:
                correlation_matrix.loc[topic1_str, topic2_str] = np.nan

    # Convert to numeric
    correlation_matrix = correlation_matrix.apply(pd.to_numeric, errors='coerce')

    # Save the inter-topicSet correlation result
    output_path = f'{OUTPUT_FOLDER}/{DATASET_NAME}/Correlation/top_top_inter/{topicSet1}_{topicSet2}_inter_top_correlation.csv'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    correlation_matrix.to_csv(output_path)


def taxonomy_levels_generation():
    print("Starting Taxonomy Levels Generation")
    taxonomy_df = pd.read_csv(str(INPUT_FOLDER / DATASET_NAME / f'taxonomy.csv'), sep=',', index_col=0, header=0)
    otu_df = pd.read_csv(str(INPUT_FOLDER / DATASET_NAME / f'otus.csv'), sep=',', index_col=0, header=0)
    
    taxonomy_df = taxonomy_df[taxonomy_df.index.isin(otu_df.columns)]
    taxonomy_tree = {}
    
    for otu_name, row in taxonomy_df.iterrows():
        current_level = taxonomy_tree
        for level in TAXONOMY_LEVELS:
            if level in taxonomy_df.columns:
                value = row[level]
                if pd.isna(value):
                    value = ""
                else:
                    value = str(value)  # Convert to string to ensure consistency
                
                # Create the level if it doesn't exist
                if value not in current_level:
                    current_level[value] = {}
                
                # Move to the next nested level
                current_level = current_level[value]
        
        # Add the OTU name at the leaf level
        if otu_name not in current_level:
            current_level[otu_name] = {}
    
    # Save as JSON
    import json
    output_path = OUTPUT_FOLDER / DATASET_NAME / 'taxonomy_levels.json'
    os.makedirs(str(output_path.parent), exist_ok=True)
    
    with open(str(output_path), 'w') as f:
        json.dump({
            'dict': taxonomy_tree,
            'levels': TAXONOMY_LEVELS
        }, f, indent=2)
    
    print(f"Taxonomy levels JSON written to {output_path}")


if __name__ == "__main__":
    MIN_TOPICS = 2
    MAX_TOPICS = 30

    """ taxonomy_levels_generation()
    sites_generation()
    metadata_otu_correlation_generation()
    metadata_metadata_correlation_generation() """
    for dim in range(MIN_TOPICS, MAX_TOPICS + 1):
        print(f"Processing dimensionality: {dim}")
        """ topic_generation(dim)
        metadata_topic_correlation_generation(dim)
        topic_topic_correlation_generation(dim) """
        if dim > MIN_TOPICS:
            inter_topicSet_correlation_generation(dim, dim - 1)
    
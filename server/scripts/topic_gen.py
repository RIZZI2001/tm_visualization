import pandas as pd
import os
import _pickle as cPickle
from sklearn.decomposition import NMF
from pathlib import Path

# base dir (the `server` folder)
# For scripts under `server/scripts`, parents[1] yields the `server` directory.
BASE_DIR = Path(__file__).resolve().parents[1]
INPUT_FOLDER = BASE_DIR / 'DATA' / 'Input'
OUTPUT_FOLDER = BASE_DIR / 'DATA' / 'Output'
OUTPUT_TRAINED_TM_MODELS = 'Trained_TM_Models'
OUTPUT_TM_COMPONENTS = 'TM_Components'
OUTPUT_TM_TOPICS = 'TM_Topics'

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
def main_function_topic_generation(dimensionality, file_name):
    print("Starting Topic Modeling with dimensionality: ", dimensionality)
    # Load and prepare data: use samples and sample IDs already present in the input data
    df = pd.read_csv(str(INPUT_FOLDER / f'otus_{file_name}.csv'), sep=',', index_col=0, header=0)
    df = df.fillna(0)
    # Topic Modeling
    nnmf_model, nnmf_topics, nnmf_components = NNMF_on_microbiome_data(df, dimensionality)
    # Save the NNMF topics, components and model

    # create output folder structure: output_folder/<file_name>/{Trained_TM_Models,TM_Components,TM_Topics}
    output_base = os.path.join(str(OUTPUT_FOLDER), file_name)
    topics_dir = os.path.join(output_base, OUTPUT_TM_TOPICS)
    components_dir = os.path.join(output_base, OUTPUT_TM_COMPONENTS)
    models_dir = os.path.join(output_base, OUTPUT_TRAINED_TM_MODELS)
    os.makedirs(topics_dir, exist_ok=True)
    os.makedirs(components_dir, exist_ok=True)
    os.makedirs(models_dir, exist_ok=True)

    # set topics index from input data and write outputs into their respective folders
    nnmf_topics.index = df.index
    topics_path = os.path.join(topics_dir, f"{dimensionality}_topics.csv")
    components_path = os.path.join(components_dir, f"{dimensionality}_components.csv")
    model_path = os.path.join(models_dir, f"{dimensionality}_topic_model_model")

    nnmf_topics.to_csv(topics_path)
    nnmf_components.to_csv(components_path)
    with open(model_path, "wb") as output_file:
        cPickle.dump(nnmf_model, output_file)


""" if __name__ == "__main__":
    for dim in range(2, 100):
        main_function_topic_generation(dim, '18s') """

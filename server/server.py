import pandas as pd
import _pickle as cPickle
from sklearn.decomposition import NMF

#global variables
input_data = 'server/Input/otus_16s_filtered.csv'
input_metadata = 'server/Input/all_metadata_combined.csv'
output_trained_TM_models = 'server/Output/Trained_TM_Models/'
output_tm_components = 'server/Output/TM_Components/'
output_tm_topics = 'server/Output/TM_Topics/'

def NNMF_on_microbiome_data(dataframe_in, dimensionality):
    """ Non-negative Matrix Factorization (NNMF) on microbiome data
    :param dataframe_in: The input microbiome data set (e.g. 16S, 18S,..)
    :param dimensionality: The number of topics (k))
    :return: The fitted NNMF model, the NNMF defined topics, the contributing components (OTUs)
    of each topic
    """
    nnmf_model = NMF(n_components=dimensionality, init='random', random_state=0, max_iter=1000)
    nnmf_topics = nnmf_model.fit_transform(dataframe_in)
    nnmf_components = nnmf_model.components_
    nnmf_topics = pd.DataFrame(nnmf_topics)
    nnmf_components = pd.DataFrame(nnmf_components, columns=dataframe_in.columns)
    return nnmf_model, nnmf_topics, nnmf_components

# Dimensionality reduction function
def main_function_topic_generation(dimensionality):
    print("Starting Topic Modeling with dimensionality: ", dimensionality)
    # Load and prepare data: Ensuring same samples are processed
    df = pd.read_csv(input_data, sep=',', index_col=0, header=0)
    df = df.fillna(0)
    # Load metadata into workspace
    df_metadata = pd.read_csv(input_metadata, sep=',', index_col=0, header=0)
    # create lists with sample names in microbiome data and metadata
    n_ids = df.index.values.tolist()
    n_ids_metadata = df_metadata.index.values.tolist()
    # Identify the common sample ids of microbiome data and metadata
    common_ids = [x for x in n_ids if x in n_ids_metadata]
    df = df.loc[common_ids]  # keeping only the common samples
    df_metadata = df_metadata.loc[common_ids]
    # Topic Modeling
    nnmf_model, nnmf_topics, nnmf_components = NNMF_on_microbiome_data(df, dimensionality)
    # Save the NNMF topics, components and model
    nnmf_topics.index = df_metadata.index
    nnmf_topics.to_csv(output_tm_topics + str(dimensionality) + '_topics.csv')
    nnmf_components.to_csv(output_tm_components + str(dimensionality) + '_components.csv')
    with open(output_trained_TM_models + str(dimensionality) + '_topic_model_' + '_model', "wb") as output_file:
        cPickle.dump(nnmf_model, output_file)

if __name__ == "__main__":
    # Example dimensionalities to run
    dimensionalities = [5, 10, 15, 20, 25, 30]
    for dim in dimensionalities:
        main_function_topic_generation(dim)
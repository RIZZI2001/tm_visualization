# Dimensionality reduction function
def main_function_topic_generation(dimensionality, preprocessing_method, topic_modeling_method, clustering_method,
                input_data, input_data_clr, input_metadata, output_trained_TM_models, output_tm_components,
                output_tm_topics, output_tm_metrics, output_clusters):
    """ Topic Modeling on Microbiome Data
    :param dimensionality: The number of topics (k)
    :param preprocessing_method: 'clr', 'fractions', 'none'
    :param topic_modeling_method: 'lda', 'nnmf', 'none'
    :param clustering_method: 'pca', 'pcoa', 'none'
    :param input_data: Path to microbiome data set
    :param input_data_clr: Path to clr-transformed data set
    :param input_metadata: Path to metadata set
    :param output_trained_TM_models: Path to saving location
    :param output_tm_components: Path to saving location
    :param output_tm_topics: Path to saving location
    :param output_tm_metrics: Path to saving location
    :param output_clusters: Path to saving location
    :return:
    """
    # Load and prepare data: Ensuring same samples are processed
    df = pd.read_csv(input_data, sep=',', index_col=0, header=0)
    df = df.fillna(0)
    # clr transformed data
    df_clr = pd.read_csv(input_data_clr, sep=',', index_col=0, header=0)
    df_clr = df_clr.fillna(0)
    df_clr.index = df.index
    # Load metadata into workspace
    df_metadata = pd.read_csv(input_metadata, sep=',', index_col=0, header=0)
    # create lists with sample names in microbiome data and metadata
    n_ids = df.index.values.tolist()
    n_ids_metadata = df_metadata.index.values.tolist()
    # Identify the common sample ids of microbiome data and metadata
    common_ids = [x for x in n_ids if x in n_ids_metadata]
    df = df.loc[common_ids]  # keeping only the common samples
    df_metadata = df_metadata.loc[common_ids]
    df_clr = df_clr.loc[common_ids]
    df_clr.columns = df.columns
    # defining the total sample number
    N_sample_number = int(len(df.index))
    # Data preprocessing
    if preprocessing_method == 'clr':
        df_trans = df_clr
    elif preprocessing_method == 'fractions':
        df_trans = data_transformation_fractions(df)
    elif preprocessing_method == 'none':
        df_trans = df
    else:
        print('Invalid preprocessing_method')
    # Topic Modeling
    # LDA
    if topic_modeling_method == 'lda':
        lda_model, lda_metric_df, lda_topics, lda_components = lda_on_microbiome_data(
            df_trans, dimensionality, N_sample_number)
        # Save LDA topics, components, metrics and model
        lda_topics.index = df_metadata.index
        lda_topics.to_csv(output_tm_topics + 'lda_dim_'
                          + str(dimensionality) + '_topic_model_' + str(topic_modeling_method) + '_prepro_' +
                          str(preprocessing_method) + '_topics.csv')
        lda_components.to_csv(output_tm_components + 'lda_dim_'
                              + str(dimensionality) + '_topic_model_' + str(topic_modeling_method) + '_prepro_' +
                              str(preprocessing_method) + '_components.csv')
        lda_metric_df.to_csv(output_tm_metrics + 'lda_dim_'
                             + str(dimensionality) + '_topic_model_' + str(topic_modeling_method) + '_prepro_' +
                             str(preprocessing_method) + '_metrics.csv')
        with open(output_trained_TM_models + 'lda_dim_'
                  + str(dimensionality) + '_topic_model_' + str(topic_modeling_method) + '_prepro_' +
                  str(preprocessing_method) + '_model', "wb") as output_file:
            cPickle.dump(lda_model, output_file)
    ## NNMF
    elif topic_modeling_method == 'nnmf':
        nnmf_model, nnmf_topics, nnmf_components = NNMF_on_microbiome_data(df_trans, dimensionality)
        # Save the NNMF topics, components and model
        nnmf_topics.index = df_metadata.index
        nnmf_topics.to_csv(output_tm_topics + 'nnmf_dim_'
                              + str(dimensionality) + '_topic_model_' + str(topic_modeling_method) + '_prepro_' +
                              str(preprocessing_method) + '_topics.csv')
        nnmf_components.to_csv(output_tm_components + 'nnmf_dim_'
                              + str(dimensionality) + '_topic_model_' + str(topic_modeling_method) + '_prepro_' +
                              str(preprocessing_method) + '_components.csv')
        with open(output_trained_TM_models + 'nnmf_dim_'
                  + str(dimensionality) + '_topic_model_' + str(topic_modeling_method) + '_prepro_' +
                  str(preprocessing_method) + '_model', "wb") as output_file:
            cPickle.dump(nnmf_model, output_file)
    # Alternative Dimensionality Reduction Methods
    elif topic_modeling_method == 'none':
        if clustering_method == 'pca':
            pca_model, pca_clusters, pca_components = PCA_on_microbiome_data(df_trans, dimensionality)
            pca_clusters = pd.DataFrame(pca_clusters)
            pca_components = pd.DataFrame(pca_components)
            # Save the pca cluster and components
            pca_clusters.index = df_metadata.index
            pca_clusters.to_csv(output_clusters + 'pca_dim_'
                               + str(dimensionality) + '_topic_model_' + str(topic_modeling_method) + '_prepro_' +
                               str(preprocessing_method) + '_clusters.csv')
            # Save the pca components
            pca_components.to_csv(output_clusters + 'pca_dim_'
                                + str(dimensionality) + '_topic_model_' + str(topic_modeling_method) + '_prepro_' +
                                str(preprocessing_method) + '_components.csv')
        elif clustering_method == 'pcoa':
            print('pcoa in progress')
            pcoa_model, pcoa_clusters = pcoa_on_microbiome_data(df_trans, dimensionality)
            pcoa_clusters = pd.DataFrame(pcoa_clusters)

            # Save the pcoa cluster
            pcoa_clusters.index = df_metadata.index
            pcoa_clusters.to_csv(output_clusters + 'pcoa_dim_'
                                 + str(dimensionality) + '_topic_model_' + str(topic_modeling_method) + '_prepro_' +
                                 str(preprocessing_method) + '_clusters.csv')

        elif clustering_method == 'none':
            print('No Topic Modeling or Clustering done')
        else:
            print('Invalid Clustering method')
    else:
         print('Invalid Topic Modeling Method')
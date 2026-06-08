"""
Data preprocessing pipeline for the Fake Job Detection project.
"""
import pandas as pd
import re

def load_data(file_path="data/raw/fake_job_postings.csv"):
    """
    Loads the dataset from the specified file path.
    """
    try:
        df = pd.read_csv(file_path)
        print(f"Data successfully loaded from {file_path}. Shape: {df.shape}")
        return df
    except Exception as e:
        print(f"Error loading dataset from {file_path}: {e}")
        return None

def clean_data(df):
    """
    Handles missing values in the dataset.
    - Fills missing text fields with empty strings.
    - Fills missing numerical fields with median or 0.
    """
    df_cleaned = df.copy()
    
    # Define primary text fields
    text_cols = ['title', 'company_profile', 'description', 'requirements']
    
    # Fill missing text fields with empty string
    for col in text_cols:
        if col in df_cleaned.columns:
            df_cleaned[col] = df_cleaned[col].fillna('')
            
    # Fill missing numerical fields with median or 0 (Exclude the target 'fraudulent')
    num_cols = df_cleaned.select_dtypes(include=['int64', 'float64']).columns
    for col in num_cols:
        if col != 'fraudulent':
            median_val = df_cleaned[col].median()
            fill_val = median_val if pd.notna(median_val) else 0
            df_cleaned[col] = df_cleaned[col].fillna(fill_val)
            
    return df_cleaned

def feature_engineering(df):
    """
    Combines text fields, cleans the text, and extracts engineered numerical features.
    """
    df_eng = df.copy()
    
    # Engineered features checking existence of specific columns
    if 'company_profile' in df_eng.columns:
        df_eng['has_company_profile'] = df_eng['company_profile'].apply(
            lambda x: 1 if str(x).strip() != '' else 0
        )
    else:
        df_eng['has_company_profile'] = 0
        
    if 'salary_range' in df_eng.columns:
        df_eng['has_salary_range'] = df_eng['salary_range'].apply(
            lambda x: 1 if pd.notna(x) and str(x).strip() != '' else 0
        )
    else:
        df_eng['has_salary_range'] = 0

    # Combine text columns into a single 'combined_text' feature
    text_cols = ['title', 'company_profile', 'description', 'requirements']
    df_eng['combined_text'] = ''
    for col in text_cols:
        if col in df_eng.columns:
            df_eng['combined_text'] += df_eng[col].astype(str) + ' '
            
    # Define a helper text cleaner to lowercase, remove special characters, and strip extra spaces
    def text_cleaner(text):
        text = str(text).lower()                 # Lowercase
        text = re.sub(r'[^a-z0-9\s]', '', text)  # Remove special characters
        text = re.sub(r'\s+', ' ', text).strip() # Remove extra spaces
        return text
        
    # Apply text cleaning
    df_eng['combined_text'] = df_eng['combined_text'].apply(text_cleaner)
    
    # Create the text_length feature from the cleaned combined_text
    df_eng['text_length'] = df_eng['combined_text'].apply(len)
    
    return df_eng

def run_preprocessing(file_path="data/raw/fake_job_postings.csv"):
    """
    Execution wrapper for the full preprocessing logic.
    """
    df = load_data(file_path)
    if df is not None:
        df_cleaned = clean_data(df)
        df_final = feature_engineering(df_cleaned)
        return df_final
    return None

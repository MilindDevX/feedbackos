# Golden-set source

- **Dataset:** Multidimensional Gold-Standard Dataset for Explanation Needs in App Reviews, v1.0
- **Author:** Martin Obaidi (Leibniz University Hannover)
- **Record:** https://zenodo.org/records/20359757 · DOI listed in its citation file: 10.5281/zenodo.20359756 (the record page shows 10.5281/zenodo.20359757)
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0), as stated in the package's `LICENSE.md`
- **redistribution: yes** (CC BY 4.0 permits sharing and adapting with attribution)
- **Download:** `https://zenodo.org/records/20359757/files/multidimensional-gold-standard-explanation-needs-app-reviews-v1.0.zip?download=1` (1,906,880,451 bytes, MD5 `6a2237fc3eeed4990805285985e7f288`)
- **Files used:**
  - `data/02_cleaned_review_candidates/en_explanation/2024-12-20T19-55-42.075Z_en_explanation_reviews_cleaned.csv` (134,109 reviews)
  - `data/02_cleaned_review_candidates/en_no_explanation_needs/2024-12-20T19-55-42.075Z_en_no_explanation_needs_reviews_cleaned.csv` (first rows only, streamed)
- **Fields used:** `review` (text). Item ID = `<store>:<app_id>:<review_id>`, because `review_id` alone is not unique.
- **Content:** real English reviews from the Apple App Store and Google Play, 1,361 apps across 21 genres, collected around November–December 2024.

## Changes made (CC BY "indicate if changes were made")

- Kept only the review text and a composite ID; dropped every other column, including `user_name`, `user_image` and developer replies.
- Removed rows the authors flagged as low quality (`is_bad_quality_rule_based` or `is_bad_quality_model_based`).
- Removed email addresses, URLs and @handles from the text, collapsed whitespace, and dropped very short or non-English reviews.
- Sampled about 200 reviews (seed `20261021`), stratified by a keyword heuristic so each FeedbackOS theme is represented, and added our own labels (theme, secondary themes, sentiment, product area) from a blind human labelling pass. The original dataset's explanation-need labels are not used.

## Attribution

Obaidi, M. (2026). *Multidimensional Gold-Standard Dataset for Explanation Needs in App Reviews* (v1.0) [Data set]. Zenodo. https://zenodo.org/records/20359757. Licensed under CC BY 4.0.

-- Other themes a feedback item clearly contains, e.g. praise alongside a complaint.
ALTER TABLE "Classification" ADD COLUMN "secondaryThemes" "Theme"[] NOT NULL DEFAULT ARRAY[]::"Theme"[];

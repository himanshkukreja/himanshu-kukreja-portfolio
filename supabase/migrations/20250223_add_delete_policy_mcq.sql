-- Add DELETE policy for mcq_user_answers
-- This allows users to delete their own answers (needed for reset functionality)

DROP POLICY IF EXISTS "Users can delete their own answers" ON mcq_user_answers;

CREATE POLICY "Users can delete their own answers" 
  ON mcq_user_answers FOR DELETE 
  USING (auth.uid() = user_id);

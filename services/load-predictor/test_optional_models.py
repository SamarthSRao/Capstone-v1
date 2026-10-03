"""NASA MODEL_DIR is LSTM-only; the hourly directory still has the ensemble."""
import os
import unittest

import server


class OptionalModelFilesTest(unittest.TestCase):
    def test_nasa_directory_is_missing_the_hourly_ensemble(self):
        nasa = os.path.join(os.path.dirname(server.__file__), "models", "nasa")
        self.assertEqual(
            server.missing_optional_model_files(nasa),
            list(server.OPTIONAL_MODEL_FILES),
        )

    def test_hourly_directory_still_has_the_ensemble(self):
        hourly = os.path.join(os.path.dirname(server.__file__), "models")
        self.assertEqual(server.missing_optional_model_files(hourly), [])


if __name__ == "__main__":
    unittest.main()

"""The RL retrain default must not be a shipped checkpoint."""
import os
import unittest

from finetune_rl_nasa import DEFAULT_OUT, SHIPPED_CHECKPOINTS, refuse_shipped_output


class RlOutputPathTest(unittest.TestCase):
    def test_default_output_is_a_separate_directory(self):
        self.assertEqual(DEFAULT_OUT, os.path.join("models", "nasa_rl", "rl_agent_checkpoint.pth"))
        self.assertNotIn(os.path.abspath(DEFAULT_OUT), {os.path.abspath(p) for p in SHIPPED_CHECKPOINTS})
        refuse_shipped_output(DEFAULT_OUT)

    def test_shipped_checkpoints_are_refused(self):
        for path in SHIPPED_CHECKPOINTS:
            with self.assertRaises(SystemExit):
                refuse_shipped_output(path)


if __name__ == "__main__":
    unittest.main()

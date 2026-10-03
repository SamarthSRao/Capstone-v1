"""Inference must not keep the epsilon stored in the checkpoint."""
import os
import tempfile
import unittest

from rl_agent import RLAgent


class InferenceEpsilonTest(unittest.TestCase):
    def test_load_restores_epsilon_and_inference_clears_it(self):
        agent = RLAgent()
        agent.epsilon = 0.03
        handle, path = tempfile.mkstemp(suffix=".pth")
        os.close(handle)
        try:
            agent.save(path)
            loaded = RLAgent()
            loaded.epsilon = 1.0
            loaded.load(path)
            self.assertAlmostEqual(loaded.epsilon, 0.03)
            loaded.load_for_inference(path)
            self.assertEqual(loaded.epsilon, 0.0)
        finally:
            os.remove(path)


if __name__ == "__main__":
    unittest.main()

"""Private terminal input must fail closed rather than fall back to echo."""
from getpass import GetPassWarning, getpass
import sys
import warnings


def private_input(prompt):
    if not sys.stdin.isatty():
        raise RuntimeError("Use an interactive terminal for private input")
    with warnings.catch_warnings():
        warnings.simplefilter("error", GetPassWarning)
        return getpass(prompt)

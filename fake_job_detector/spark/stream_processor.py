"""Backward-compatible wrapper for the production Spark stream job."""

from spark.spark_stream import main


if __name__ == "__main__":
    main()

import os
import sys

# Ensure the AI/ project root is on sys.path so sibling top-level packages
# (graph, agents, tools, db, memory, config) are importable inside Celery
# workers. Celery's app-loader only puts cwd on the path transiently during
# app discovery, which makes deferred task imports like `from graph.graph
# import run_autonomous` fail with ModuleNotFoundError in forked workers.
_AI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AI_ROOT not in sys.path:
    sys.path.insert(0, _AI_ROOT)

from celery import Celery
from config.settings import settings

celery_app = Celery(
    "medisync",
    broker=settings.celery_broker_url,
    backend=settings.celery_broker_url,
    include=[
        "workers.tasks.appointment_tasks",
        "workers.tasks.inventory_tasks",
        "workers.tasks.staff_tasks",
        "workers.tasks.clinical_tasks",
    ],
)
celery_app.conf.timezone = "UTC"

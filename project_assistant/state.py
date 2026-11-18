from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from .common import now


class StateBusy(RuntimeError):
    """另一个控制器进程正持有队列锁（审查/知识同步/恢复）。"""


class State:
    def __init__(self, path):
        self.db = sqlite3.connect(path, timeout=30)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS prs(number TEXT PRIMARY KEY, fingerprint TEXT, active INTEGER);
        CREATE TABLE IF NOT EXISTS jobs(
          id TEXT PRIMARY KEY, number TEXT, payload TEXT, status TEXT,
          attempts INTEGER DEFAULT 0, retry_at REAL DEFAULT 0,
          error TEXT, report TEXT, updated TEXT);
        """)
        self.db.commit()

    def close(self):
        self.db.close()

    def recover(self):
        """Resume work after a crash (watch mode): running -> pending."""
        cursor = self.db.execute("UPDATE jobs SET status='pending' WHERE status='running'")
        self.db.commit()
        return cursor.rowcount

    def interrupt_running(self, reason):
        """Mark rows left 'running' by a dead process as failed so the page can retry.

        Used when no controller process owns the queue (for example the Harness plugin
        was restarted while a review CLI child was running).
        """
        cursor = self.db.execute(
            "UPDATE jobs SET status='failed', error=?, retry_at=0, updated=? WHERE status='running'",
            (reason, now()))
        self.db.commit()
        return cursor.rowcount

    @contextmanager
    def lock(self, name):
        # Cross-process OS advisory lock; a crashed process cannot leave it held.
        import os
        from pathlib import Path
        lock_path = Path(self.db.execute("PRAGMA database_list").fetchone()[2]).with_suffix("." + name + ".lock")
        with lock_path.open("a+b") as stream:
            # 不要读取已加锁的字节（Windows 上会被占用方阻塞成 PermissionError），
            # 只用文件大小判断是否需要写入初始字节。
            if stream.seek(0, 2) == 0:
                stream.write(b"0")
                stream.flush()
            stream.seek(0)
            try:
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as exc:
                # Windows 的 msvcrt 在锁被占用时抛 PermissionError(13)；
                # 对调用方来说这是「另一个任务在跑」，不是权限问题。
                raise StateBusy(
                    "另一个控制器进程正在执行审查/知识同步/恢复，请等待其结束或稍后重试"
                    f"（{name} 锁被占用）") from exc
            try:
                yield
            finally:
                if os.name == "nt":
                    stream.seek(0)
                    msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(stream, fcntl.LOCK_UN)

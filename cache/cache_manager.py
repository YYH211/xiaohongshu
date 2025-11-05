"""
缓存管理模块 - 用于存储和查询任务历史记录
使用JSON文件进行持久化存储
"""

import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from pathlib import Path


class CacheManager:
    """任务历史缓存管理器"""

    def __init__(self, cache_file: str = None):
        """
        初始化缓存管理器

        Args:
            cache_file: 缓存文件路径，默认为 cache/task_history.json
        """
        if cache_file is None:
            # 获取当前文件所在目录
            current_dir = Path(__file__).parent
            cache_file = current_dir / "task_history.json"

        self.cache_file = Path(cache_file)
        self._ensure_cache_file()

    def _ensure_cache_file(self):
        """确保缓存文件和目录存在"""
        # 创建目录
        self.cache_file.parent.mkdir(parents=True, exist_ok=True)

        # 如果文件不存在，创建空文件
        if not self.cache_file.exists():
            self._write_cache([])

    def _read_cache(self) -> List[Dict]:
        """读取缓存文件"""
        try:
            with open(self.cache_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def _write_cache(self, data: List[Dict]):
        """写入缓存文件"""
        with open(self.cache_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def add_task(self, task_data: Dict) -> bool:
        """
        添加任务记录

        Args:
            task_data: 任务数据，必须包含以下字段：
                - topic: 任务主题
                - status: 任务状态 (success/error/running)
                - progress: 进度百分比
                - message: 状态消息
                可选字段：
                - title: 文章标题
                - content: 文章内容
                - tags: 标签列表
                - images: 图片列表
                - publish_time: 发布时间

        Returns:
            是否添加成功
        """
        try:
            # 生成唯一ID
            task_id = f"task-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"

            # 添加时间戳和ID
            task_record = {
                "id": task_id,
                "topic": task_data.get("topic", "未知主题"),
                "status": task_data.get("status", "running"),
                "progress": task_data.get("progress", 0),
                "message": task_data.get("message", ""),
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
            }

            # 添加可选字段
            optional_fields = ["title", "content", "tags", "images", "publish_time"]
            for field in optional_fields:
                if field in task_data:
                    task_record[field] = task_data[field]

            # 读取现有记录
            cache = self._read_cache()

            # 添加新记录到开头
            cache.insert(0, task_record)

            # 限制最多保存1000条记录
            if len(cache) > 1000:
                cache = cache[:1000]

            # 写入文件
            self._write_cache(cache)

            return True
        except Exception as e:
            print(f"添加任务记录失败: {e}")
            return False

    def update_task(self, task_id: str, updates: Dict) -> bool:
        """
        更新任务记录

        Args:
            task_id: 任务ID
            updates: 要更新的字段

        Returns:
            是否更新成功
        """
        try:
            cache = self._read_cache()

            # 查找并更新任务
            for task in cache:
                if task.get("id") == task_id:
                    task.update(updates)
                    task["updated_at"] = datetime.now().isoformat()
                    self._write_cache(cache)
                    return True

            return False
        except Exception as e:
            print(f"更新任务记录失败: {e}")
            return False

    def get_tasks(self,
                  start_date: Optional[str] = None,
                  end_date: Optional[str] = None,
                  status: Optional[str] = None,
                  limit: int = 100) -> List[Dict]:
        """
        查询任务记录

        Args:
            start_date: 开始日期 (ISO格式: YYYY-MM-DD)
            end_date: 结束日期 (ISO格式: YYYY-MM-DD)
            status: 任务状态过滤 (success/error/running)
            limit: 返回记录数量限制

        Returns:
            任务记录列表
        """
        try:
            cache = self._read_cache()

            # 应用过滤器
            filtered = cache

            # 日期过滤
            if start_date:
                start_dt = datetime.fromisoformat(start_date)
                filtered = [t for t in filtered
                           if datetime.fromisoformat(t["created_at"]) >= start_dt]

            if end_date:
                # 结束日期包含当天的23:59:59
                end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
                filtered = [t for t in filtered
                           if datetime.fromisoformat(t["created_at"]) < end_dt]

            # 状态过滤
            if status:
                filtered = [t for t in filtered if t.get("status") == status]

            # 限制数量
            return filtered[:limit]
        except Exception as e:
            print(f"查询任务记录失败: {e}")
            return []

    def get_task_by_id(self, task_id: str) -> Optional[Dict]:
        """
        根据ID获取任务记录

        Args:
            task_id: 任务ID

        Returns:
            任务记录，如果不存在返回None
        """
        cache = self._read_cache()
        for task in cache:
            if task.get("id") == task_id:
                return task
        return None

    def delete_task(self, task_id: str) -> bool:
        """
        删除任务记录

        Args:
            task_id: 任务ID

        Returns:
            是否删除成功
        """
        try:
            cache = self._read_cache()
            original_length = len(cache)

            # 过滤掉要删除的任务
            cache = [t for t in cache if t.get("id") != task_id]

            if len(cache) < original_length:
                self._write_cache(cache)
                return True

            return False
        except Exception as e:
            print(f"删除任务记录失败: {e}")
            return False

    def clear_old_tasks(self, days: int = 30) -> int:
        """
        清理指定天数之前的任务记录

        Args:
            days: 保留最近多少天的记录

        Returns:
            删除的记录数量
        """
        try:
            cache = self._read_cache()
            cutoff_date = datetime.now() - timedelta(days=days)

            # 过滤掉旧记录
            new_cache = [t for t in cache
                        if datetime.fromisoformat(t["created_at"]) >= cutoff_date]

            deleted_count = len(cache) - len(new_cache)

            if deleted_count > 0:
                self._write_cache(new_cache)

            return deleted_count
        except Exception as e:
            print(f"清理旧任务记录失败: {e}")
            return 0

    def get_statistics(self) -> Dict:
        """
        获取任务统计信息

        Returns:
            统计信息字典
        """
        cache = self._read_cache()

        total = len(cache)
        success = len([t for t in cache if t.get("status") == "success"])
        error = len([t for t in cache if t.get("status") == "error"])
        running = len([t for t in cache if t.get("status") == "running"])

        return {
            "total": total,
            "success": success,
            "error": error,
            "running": running,
            "success_rate": round(success / total * 100, 2) if total > 0 else 0
        }

"""
全局 MCP 服务器管理器
负责在应用启动时初始化所有 MCP 服务器,并在整个应用生命周期内复用这些连接
"""
import json
import logging
import os
from typing import List, Optional, Dict, Any
from core.xhs_llm_client import Server, Tool, LLMClient

logger = logging.getLogger(__name__)


class ServerManager:
    """全局服务器管理器单例"""

    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化管理器"""
        if not ServerManager._initialized:
            self.servers: List[Server] = []
            self.llm_client: Optional[LLMClient] = None
            self.config: Optional[Dict[str, Any]] = None
            ServerManager._initialized = True

    async def initialize(self, config: Dict[str, Any]):
        """初始化所有 MCP 服务器

        Args:
            config: 应用配置字典
        """
        try:
            logger.info("开始初始化全局 MCP 服务器...")

            # 保存配置
            self.config = config

            # 从 servers_config.json 读取服务器配置
            config_path = os.path.join(
                os.path.dirname(__file__),
                '..',
                'config',
                'servers_config.json'
            )

            if not os.path.exists(config_path):
                logger.warning(f"服务器配置文件不存在: {config_path}")
                return

            with open(config_path, 'r', encoding='utf-8') as f:
                server_config = json.load(f)

            # 创建服务器实例
            self.servers = [
                Server(name, srv_config)
                for name, srv_config in server_config["mcpServers"].items()
            ]

            # 初始化 LLM 客户端
            self.llm_client = LLMClient(
                config.get('llm_api_key'),
                config.get('openai_base_url'),
                config.get('default_model', 'claude-sonnet-4-20250514')
            )

            # 初始化所有服务器
            initialized_count = 0
            for server in self.servers:
                try:
                    await server.initialize()
                    initialized_count += 1
                    logger.info(f"✅ 成功初始化服务器: {server.name}")
                except Exception as e:
                    logger.error(f"❌ 初始化服务器 {server.name} 失败: {e}")

            logger.info(f"🎉 全局 MCP 服务器初始化完成: {initialized_count}/{len(self.servers)} 个服务器已就绪")

        except Exception as e:
            logger.error(f"初始化全局服务器失败: {e}", exc_info=True)
            raise

    async def get_available_tools(self) -> List[Tool]:
        """获取所有可用的工具

        Returns:
            所有服务器提供的工具列表
        """
        all_tools = []
        for server in self.servers:
            try:
                tools = await server.list_tools()
                all_tools.extend(tools)
            except Exception as e:
                logger.error(f"从服务器 {server.name} 获取工具失败: {e}")

        return all_tools

    def get_servers(self) -> List[Server]:
        """获取所有已初始化的服务器

        Returns:
            服务器列表
        """
        return self.servers

    def get_llm_client(self) -> Optional[LLMClient]:
        """获取 LLM 客户端

        Returns:
            LLM 客户端实例
        """
        return self.llm_client

    def update_llm_client(self, config: Dict[str, Any]):
        """更新 LLM 客户端配置

        Args:
            config: 新的配置字典
        """
        self.config = config
        self.llm_client = LLMClient(
            config.get('llm_api_key'),
            config.get('openai_base_url'),
            config.get('default_model', 'claude-sonnet-4-20250514')
        )
        logger.info("LLM 客户端配置已更新")

    async def cleanup(self):
        """清理所有服务器连接"""
        logger.info("开始清理全局 MCP 服务器...")

        for server in reversed(self.servers):
            try:
                await server.cleanup()
                logger.info(f"清理服务器: {server.name}")
            except Exception as e:
                logger.warning(f"清理服务器 {server.name} 时出错: {e}")

        self.servers = []
        self.llm_client = None
        ServerManager._initialized = False
        logger.info("全局 MCP 服务器清理完成")

    def is_initialized(self) -> bool:
        """检查服务器是否已初始化

        Returns:
            是否已初始化
        """
        return len(self.servers) > 0 and self.llm_client is not None


# 创建全局单例实例
server_manager = ServerManager()
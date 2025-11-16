"""
配置管理模块
负责读取、保存和管理应用配置
"""
import os
import json
import logging
from pathlib import Path
from typing import Dict, Any

logger = logging.getLogger(__name__)


class ConfigManager:
    """配置管理器"""

    def __init__(self, config_dir='config'):
        """初始化配置管理器

        Args:
            config_dir: 配置文件目录
        """
        # 使用绝对路径，确保无论从哪里运行都能找到配置目录
        if not os.path.isabs(config_dir):
            # 获取项目根目录（app.py所在目录）
            project_root = Path(__file__).parent.parent
            self.config_dir = project_root / config_dir
        else:
            self.config_dir = Path(config_dir)

        self.config_dir.mkdir(exist_ok=True)

        self.config_file = self.config_dir / 'app_config.json'
        self.servers_config_file = self.config_dir / 'servers_config.json'
        self.env_file = self.config_dir / '.env'

    def load_config(self, mask_sensitive: bool = False) -> Dict[str, Any]:
        """加载应用配置

        Args:
            mask_sensitive: 是否脱敏敏感信息(仅用于前端显示)

        Returns:
            配置字典
        """
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)

                # 如果需要脱敏(创建副本,不修改原始数据)
                if mask_sensitive:
                    import copy
                    masked_config = copy.deepcopy(config)
                    sensitive_fields = ['llm_api_key', 'jina_api_key', 'tavily_api_key']
                    for field in sensitive_fields:
                        if field in masked_config and masked_config[field]:
                            masked_config[field] = self._mask_sensitive_value(masked_config[field])
                    return masked_config

                return config
            except Exception as e:
                logger.error(f"加载配置失败: {e}")
                return {}
        return {}

    def save_config(self, config: Dict[str, Any]) -> bool:
        """保存应用配置

        Args:
            config: 配置字典

        Returns:
            是否保存成功
        """
        try:
            # 如果是部分更新,先加载现有配置再合并
            existing_config = self.load_config()
            merged_config = {**existing_config, **config}

            # 保存到JSON配置文件
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(merged_config, f, indent=2, ensure_ascii=False)

            # 更新servers_config.json
            self._update_servers_config(merged_config)

            logger.info("配置保存成功")
            return True

        except Exception as e:
            logger.error(f"保存配置失败: {e}")
            return False

    def _mask_sensitive_value(self, value: str) -> str:
        """脱敏敏感信息

        Args:
            value: 原始值

        Returns:
            脱敏后的值
        """
        if not value:
            return ''
        # 只显示前4个和后4个字符
        if len(value) <= 8:
            return '*' * len(value)
        return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"

    def _update_servers_config(self, config: Dict[str, Any]):
        """更新MCP服务器配置文件

        Args:
            config: 配置字典
        """
        servers_config = {
            "mcpServers": {
                "jina-mcp-tools": {
                    "args": ["jina-mcp-tools"],
                    "command": "npx",
                    "env": {
                        "JINA_API_KEY": config.get('jina_api_key', '')
                    }
                },
                "tavily-remote": {
                    "command": "npx",
                    "args": [
                        "-y",
                        "mcp-remote",
                        f"https://mcp.tavily.com/mcp/?tavilyApiKey={config.get('tavily_api_key', '')}"
                    ]
                },
                "xhs": {
                    "type": "streamable_http",
                    "url": config.get('xhs_mcp_url', 'http://localhost:18060/mcp')
                }
            }
        }

        with open(self.servers_config_file, 'w', encoding='utf-8') as f:
            json.dump(servers_config, f, indent=2, ensure_ascii=False)

    def get_servers_config_path(self) -> str:
        """获取服务器配置文件路径

        Returns:
            配置文件绝对路径
        """
        return str(self.servers_config_file.absolute())

    def validate_config(self, config: Dict[str, Any]) -> tuple[bool, str]:
        """验证配置的完整性

        Args:
            config: 配置字典

        Returns:
            (是否有效, 错误信息)
        """
        required_fields = {
            'llm_api_key': 'LLM API Key',
            'openai_base_url': 'OpenAI Base URL',
            'default_model': '默认模型',
            'xhs_mcp_url': '小红书MCP服务地址'
        }

        for field, name in required_fields.items():
            if not config.get(field):
                return False, f"缺少必填字段: {name}"

        # 验证URL格式
        import re
        url_pattern = r'^https?://'

        if not re.match(url_pattern, config.get('openai_base_url', '')):
            return False, "OpenAI Base URL格式不正确"

        if not re.match(url_pattern, config.get('xhs_mcp_url', '')):
            return False, "小红书MCP服务地址格式不正确"

        return True, ""

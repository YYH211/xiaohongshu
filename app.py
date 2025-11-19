"""
小红书内容自动生成与发布 - Web应用主程序 (FastAPI版本)
"""
import os
import logging
from datetime import datetime
from typing import Dict, Any, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests

from core.content_generator import ContentGenerator
from core.server_manager import server_manager
from config.config_manager import ConfigManager
from cache.cache_manager import CacheManager

# 获取当前文件的目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# 生命周期管理
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行
    os.makedirs(os.path.join(BASE_DIR, 'config'), exist_ok=True)
    logger.info("应用启动，目录初始化完成")

    # 尝试初始化全局 MCP 服务器(如果配置存在)
    try:
        config = config_manager.load_config()
        if config.get('llm_api_key') and config.get('openai_base_url'):
            logger.info("检测到配置文件,开始初始化全局 MCP 服务器...")
            await server_manager.initialize(config)
            logger.info("✅ 全局 MCP 服务器初始化完成,请求将直接使用已初始化的连接")
        else:
            logger.info("配置不完整,跳过 MCP 服务器初始化")
    except Exception as e:
        logger.warning(f"启动时初始化 MCP 服务器失败: {e}, 将在首次请求时初始化")

    yield

    # 关闭时执行
    logger.info("应用关闭,清理资源...")
    try:
        await server_manager.cleanup()
        logger.info("✅ 全局 MCP 服务器资源清理完成")
    except Exception as e:
        logger.error(f"清理资源失败: {e}")
    logger.info("应用关闭完成")


# 创建 FastAPI 应用
app = FastAPI(
    title="小红书内容自动生成与发布系统",
    description="智能生成高质量小红书内容，一键发布",
    version="1.0.0",
    lifespan=lifespan
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 配置模板
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# 初始化配置管理器和缓存管理器
config_manager = ConfigManager()
cache_manager = CacheManager()


# Pydantic 模型
class ConfigRequest(BaseModel):
    llm_api_key: str = None
    openai_base_url: str = None
    default_model: str = None
    jina_api_key: str = None
    tavily_api_key: str = None
    xhs_mcp_url: str = None


class TestLoginRequest(BaseModel):
    xhs_mcp_url: str


class ValidateModelRequest(BaseModel):
    model_config = {"protected_namespaces": ()}

    llm_api_key: str
    openai_base_url: str
    model_name: str


class GeneratePublishRequest(BaseModel):
    topic: str
    content_type: str = "general"  # "general" 或 "paper_analysis"


class TaskHistoryQueryRequest(BaseModel):
    start_date: str = None
    end_date: str = None
    status: str = None
    limit: int = 100


class BatchGeneratePublishRequest(BaseModel):
    topics: List[str]
    content_type: str = "general"  # "general" 或 "paper_analysis"


# 路由
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """首页"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/config")
async def get_config() -> Dict[str, Any]:
    """获取配置信息（密钥已脱敏）"""
    try:
        # 使用脱敏模式加载配置
        config = config_manager.load_config(mask_sensitive=True)
        return {'success': True, 'config': config}
    except Exception as e:
        logger.error(f"获取配置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/config")
async def save_config(config_data: ConfigRequest) -> Dict[str, Any]:
    """保存配置(支持部分更新)"""
    try:
        # 将请求数据转换为字典,排除未设置的字段
        config_dict = config_data.model_dump(exclude_unset=True)

        # 过滤掉脱敏的占位符(以*开头的值不更新)
        filtered_config = {
            k: v for k, v in config_dict.items()
            if v and not (isinstance(v, str) and '*' in v)
        }

        # 如果没有要更新的字段
        if not filtered_config:
            return {'success': True, 'message': '没有需要更新的配置'}

        # 保存配置(支持部分更新)
        config_manager.save_config(filtered_config)

        # 重新初始化全局 MCP 服务器
        try:
            logger.info("配置已更新,重新初始化全局 MCP 服务器...")
            # 先清理旧的服务器连接
            await server_manager.cleanup()
            # 初始化新的服务器连接
            await server_manager.initialize(config_dict)
            logger.info("✅ 全局 MCP 服务器重新初始化完成")
        except Exception as e:
            logger.error(f"重新初始化 MCP 服务器失败: {e}")
            # 不阻止配置保存,只记录错误

        return {'success': True, 'message': '配置保存成功'}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"保存配置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/validate-model")
async def validate_model(request_data: ValidateModelRequest) -> Dict[str, Any]:
    """验证模型是否可用"""
    try:
        llm_api_key = request_data.llm_api_key
        openai_base_url = request_data.openai_base_url
        model_name = request_data.model_name

        if not llm_api_key or not openai_base_url or not model_name:
            raise HTTPException(status_code=400, detail="请检查LLM API key、Base URL和模型名称是否填写完整")

        # 尝试调用模型进行验证
        try:
            import openai

            client = openai.OpenAI(
                api_key=llm_api_key,
                base_url=openai_base_url
            )

            # 发送一个简单的测试请求
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "user", "content": "Hi"}
                ],
                stream=False
            )

            if response and response.choices:
                return {
                    'success': True,
                    'message': f'模型 {model_name} 验证成功',
                    'model': model_name
                }
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f'模型 {model_name} 响应异常'
                )

        except Exception as e:
            error_msg = str(e)
            # 检查是否是模型不存在的错误
            if 'model_not_found' in error_msg.lower() or 'does not exist' in error_msg.lower() or 'invalid model' in error_msg.lower():
                raise HTTPException(
                    status_code=400,
                    detail=f'模型 {model_name} 不存在或不可用'
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f'模型验证失败: {error_msg}'
                )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"验证模型失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/test-login")
async def test_login(request_data: TestLoginRequest) -> Dict[str, Any]:
    """测试小红书账号登录"""
    try:
        xhs_mcp_url = request_data.xhs_mcp_url

        if not xhs_mcp_url:
            raise HTTPException(status_code=400, detail="请提供小红书MCP服务地址")

        # 调用小红书MCP服务测试连接
        try:
            response = requests.get(f"{xhs_mcp_url}/health", timeout=5)
            if response.status_code == 200:
                return {
                    'success': True,
                    'message': '小红书MCP服务连接成功',
                    'status': 'connected'
                }
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f'服务响应异常: {response.status_code}'
                )
        except requests.exceptions.RequestException as e:
            raise HTTPException(
                status_code=500,
                detail=f'无法连接到MCP服务: {str(e)}'
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"测试登录失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-and-publish")
async def generate_and_publish(request_data: GeneratePublishRequest) -> Dict[str, Any]:
    """生成内容并发布到小红书"""
    try:
        topic = request_data.topic
        content_type = request_data.content_type

        if not topic:
            raise HTTPException(status_code=400, detail="请输入主题")

        # 验证内容类型
        if content_type not in ["general", "paper_analysis"]:
            raise HTTPException(status_code=400, detail="内容类型必须是 'general' 或 'paper_analysis'")

        # 检查配置是否完整
        config = config_manager.load_config()
        if not config.get('llm_api_key') or not config.get('xhs_mcp_url'):
            raise HTTPException(status_code=400, detail="请先完成配置")

        # 创建内容生成器
        generator = ContentGenerator(config)

        # 异步执行内容生成和发布
        result = await generator.generate_and_publish(topic, content_type)

        if result.get('success'):
            response_data = {
                'title': result.get('title', ''),
                'content': result.get('content', ''),
                'tags': result.get('tags', []),
                'images': result.get('images', []),
                'publish_status': result.get('publish_status', ''),
                'publish_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }

            # 保存到缓存
            task_record = {
                'topic': topic,
                'status': 'success',
                'progress': 100,
                'message': '发布成功',
                **response_data
            }
            task_id = cache_manager.add_task(task_record)

            return {
                'success': True,
                'message': '内容生成并发布成功',
                'data': response_data
            }
        else:
            # 保存失败记录到缓存
            cache_manager.add_task({
                'topic': topic,
                'status': 'error',
                'progress': 0,
                'message': result.get('error', '生成失败')
            })

            raise HTTPException(
                status_code=500,
                detail=result.get('error', '生成失败')
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成和发布失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/status/{task_id}")
async def get_task_status(task_id: str) -> Dict[str, Any]:
    """获取任务状态（用于后续扩展异步任务）"""
    return {
        'success': True,
        'task_id': task_id,
        'status': 'completed',
        'progress': 100
    }


@app.get("/api/history")
async def get_task_history(
    start_date: str = None,
    end_date: str = None,
    status: str = None,
    limit: int = 100
) -> Dict[str, Any]:
    """获取任务历史记录"""
    try:
        tasks = cache_manager.get_tasks(
            start_date=start_date,
            end_date=end_date,
            status=status,
            limit=limit
        )
        return {
            'success': True,
            'data': tasks,
            'count': len(tasks)
        }
    except Exception as e:
        logger.error(f"获取历史记录失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/history/{task_id}")
async def delete_task_history(task_id: str) -> Dict[str, Any]:
    """删除指定的任务历史记录"""
    try:
        success = cache_manager.delete_task(task_id)
        if success:
            return {
                'success': True,
                'message': '任务已删除'
            }
        else:
            raise HTTPException(status_code=404, detail='任务不存在')
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history/statistics")
async def get_statistics() -> Dict[str, Any]:
    """获取任务统计信息"""
    try:
        stats = cache_manager.get_statistics()
        return {
            'success': True,
            'data': stats
        }
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class FetchTrendingTopicsRequest(BaseModel):
    domain: str = ""


class FetchTopicsFromUrlRequest(BaseModel):
    url: str


@app.post("/api/fetch-trending-topics")
async def fetch_trending_topics(request_data: FetchTrendingTopicsRequest = None) -> Dict[str, Any]:
    """获取今日热点新闻主题"""
    try:
        # 检查配置是否完整
        config = config_manager.load_config()
        if not config.get('llm_api_key'):
            raise HTTPException(status_code=400, detail="请先完成配置")

        # 如果全局服务器未初始化,先初始化
        if not server_manager.is_initialized():
            logger.info("全局服务器未初始化,开始初始化...")
            await server_manager.initialize(config)

        # 获取领域参数
        domain = request_data.domain if request_data else ""

        # 创建内容生成器
        generator = ContentGenerator(config)

        # 获取热点主题(会自动使用全局服务器管理器)
        topics = await generator.fetch_trending_topics(domain=domain)

        if topics:
            return {
                'success': True,
                'topics': topics
            }
        else:
            raise HTTPException(status_code=500, detail='未能获取热点主题')

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取热点主题失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/fetch-topics-from-url")
async def fetch_topics_from_url(request_data: FetchTopicsFromUrlRequest) -> Dict[str, Any]:
    """从URL爬取内容并提取主题"""
    try:
        url = request_data.url

        if not url:
            raise HTTPException(status_code=400, detail="请提供URL")

        # 检查配置是否完整
        config = config_manager.load_config()
        if not config.get('llm_api_key'):
            raise HTTPException(status_code=400, detail="请先完成配置")

        # 如果全局服务器未初始化,先初始化
        if not server_manager.is_initialized():
            logger.info("全局服务器未初始化,开始初始化...")
            await server_manager.initialize(config)

        # 创建内容生成器
        generator = ContentGenerator(config)

        # 从URL提取主题(会自动使用全局服务器管理器)
        topics = await generator.fetch_topics_from_url(url)

        if topics:
            return {
                'success': True,
                'topics': topics
            }
        else:
            raise HTTPException(status_code=500, detail='未能从该URL提取主题')

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"从URL提取主题失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/batch-generate-and-publish")
async def batch_generate_and_publish(request_data: BatchGeneratePublishRequest) -> Dict[str, Any]:
    """批量生成内容并发布到小红书"""
    try:
        topics = request_data.topics
        content_type = request_data.content_type

        if not topics or len(topics) == 0:
            raise HTTPException(status_code=400, detail="请选择至少一个主题")

        # 验证内容类型
        if content_type not in ["general", "paper_analysis"]:
            raise HTTPException(status_code=400, detail="内容类型必须是 'general' 或 'paper_analysis'")

        # 检查配置是否完整
        config = config_manager.load_config()
        if not config.get('llm_api_key') or not config.get('xhs_mcp_url'):
            raise HTTPException(status_code=400, detail="请先完成配置")

        results = []
        success_count = 0
        failed_count = 0

        # 对每个主题生成和发布
        for topic in topics:
            try:
                # 创建内容生成器
                generator = ContentGenerator(config)

                # 执行内容生成和发布
                result = await generator.generate_and_publish(topic, content_type)

                if result.get('success'):
                    success_count += 1
                    response_data = {
                        'topic': topic,
                        'title': result.get('title', ''),
                        'content': result.get('content', ''),
                        'tags': result.get('tags', []),
                        'images': result.get('images', []),
                        'publish_status': result.get('publish_status', ''),
                        'publish_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        'status': 'success'
                    }

                    # 保存到缓存
                    task_record = {
                        'topic': topic,
                        'status': 'success',
                        'progress': 100,
                        'message': '发布成功',
                        **response_data
                    }
                    cache_manager.add_task(task_record)

                    results.append(response_data)
                else:
                    failed_count += 1
                    error_msg = result.get('error', '生成失败')

                    # 保存失败记录到缓存
                    cache_manager.add_task({
                        'topic': topic,
                        'status': 'error',
                        'progress': 0,
                        'message': error_msg
                    })

                    results.append({
                        'topic': topic,
                        'status': 'error',
                        'error': error_msg
                    })

            except Exception as e:
                failed_count += 1
                logger.error(f"处理主题 '{topic}' 失败: {e}", exc_info=True)

                # 保存失败记录到缓存
                cache_manager.add_task({
                    'topic': topic,
                    'status': 'error',
                    'progress': 0,
                    'message': str(e)
                })

                results.append({
                    'topic': topic,
                    'status': 'error',
                    'error': str(e)
                })

        return {
            'success': True,
            'message': f'批量处理完成：成功 {success_count} 个，失败 {failed_count} 个',
            'summary': {
                'total': len(topics),
                'success': success_count,
                'failed': failed_count
            },
            'results': results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"批量生成和发布失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# 挂载静态文件 - 必须在所有路由定义之后
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
        log_level="info"
    )
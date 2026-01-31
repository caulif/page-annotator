try {
  let removedCount = 0;

  // 移除标注容器
  const container = document.getElementById('page-annotator-container');
  if (container) {
    const elements = container.querySelectorAll('.page-annotator-highlight, .page-annotator-label, .page-annotator-comment, .page-annotator-comment-underline');
    removedCount = elements.length;
    container.remove();
  }

  // 移除样式
  const styles = document.getElementById('page-annotator-styles');
  if (styles) {
    styles.remove();
  }

  return {
    success: true,
    message: removedCount > 0 ? `已清除 ${removedCount} 个标注` : '没有需要清除的标注',
    removedCount: removedCount
  };

} catch (error) {
  return {
    success: false,
    message: `清除失败: ${error.message}`,
    error: error.toString()
  };
}

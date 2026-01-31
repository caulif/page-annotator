// 诊断脚本 - 用于调试标注问题

try {
  const diagnostics = {
    timestamp: Date.now(),
    page: {
      url: window.location.href,
      title: document.title,
      scrollX: window.pageXOffset || document.documentElement.scrollLeft || 0,
      scrollY: window.pageYOffset || document.documentElement.scrollTop || 0,
      viewportWidth: window.innerWidth || document.documentElement.clientWidth,
      viewportHeight: window.innerHeight || document.documentElement.clientHeight,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth
    },
    annotations: {
      container: null,
      comments: [],
      highlights: [],
      labels: [],
      arrows: [],
      total: 0
    },
    executionState: {
      lastExecutions: window.__pageAnnotatorLastExecution || {},
      executionCount: window.__pageAnnotatorLastExecution ? Object.keys(window.__pageAnnotatorLastExecution).length : 0
    }
  };

  // 检查标注容器
  const container = document.getElementById('page-annotator-container');
  if (container) {
    diagnostics.annotations.container = {
      exists: true,
      position: container.style.position,
      zIndex: container.style.zIndex,
      childCount: container.children.length
    };

    // 统计各类标注
    const comments = container.querySelectorAll('.page-annotator-comment');
    const highlights = container.querySelectorAll('.page-annotator-highlight');
    const labels = container.querySelectorAll('.page-annotator-label');

    diagnostics.annotations.comments = Array.from(comments).map((el, idx) => ({
      index: idx,
      id: el.getAttribute('data-annotator-id'),
      text: el.textContent.substring(0, 50),
      position: {
        top: el.style.top,
        left: el.style.left
      },
      className: el.className
    }));

    diagnostics.annotations.highlights = Array.from(highlights).map((el, idx) => ({
      index: idx,
      id: el.getAttribute('data-annotator-id'),
      position: {
        top: el.style.top,
        left: el.style.left,
        width: el.style.width,
        height: el.style.height
      }
    }));

    diagnostics.annotations.labels = Array.from(labels).map((el, idx) => ({
      index: idx,
      text: el.textContent,
      position: {
        top: el.style.top,
        left: el.style.left
      }
    }));

    diagnostics.annotations.total = comments.length + highlights.length + labels.length;
  } else {
    diagnostics.annotations.container = {
      exists: false,
      message: '标注容器不存在'
    };
  }

  // 检查重复的标注
  const allIds = diagnostics.annotations.comments.map(c => c.id)
    .concat(diagnostics.annotations.highlights.map(h => h.id))
    .filter(id => id);
  
  const duplicateIds = allIds.filter((id, index) => allIds.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    diagnostics.duplicates = {
      found: true,
      count: duplicateIds.length,
      ids: duplicateIds
    };
  } else {
    diagnostics.duplicates = {
      found: false,
      message: '未发现重复的标注 ID'
    };
  }

  // 检查位置异常
  const positionIssues = [];
  diagnostics.annotations.comments.forEach(comment => {
    const top = parseInt(comment.position.top);
    const left = parseInt(comment.position.left);
    if (isNaN(top) || isNaN(left)) {
      positionIssues.push({
        type: 'comment',
        id: comment.id,
        issue: '位置值无效'
      });
    } else if (top < 0 || left < 0) {
      positionIssues.push({
        type: 'comment',
        id: comment.id,
        issue: '位置为负值'
      });
    } else if (top > diagnostics.page.documentHeight || left > diagnostics.page.documentWidth) {
      positionIssues.push({
        type: 'comment',
        id: comment.id,
        issue: '位置超出文档范围'
      });
    }
  });

  if (positionIssues.length > 0) {
    diagnostics.positionIssues = {
      found: true,
      count: positionIssues.length,
      issues: positionIssues
    };
  } else {
    diagnostics.positionIssues = {
      found: false,
      message: '未发现位置异常'
    };
  }

  // 生成建议
  const suggestions = [];
  
  if (diagnostics.annotations.total === 0) {
    suggestions.push('页面上没有标注，可能标注失败或已被清除');
  }
  
  if (diagnostics.annotations.total > 50) {
    suggestions.push(`标注数量过多（${diagnostics.annotations.total}个），建议清除后重新标注`);
  }
  
  if (diagnostics.duplicates.found) {
    suggestions.push(`发现 ${diagnostics.duplicates.count} 个重复的标注，建议清除后重新标注`);
  }
  
  if (diagnostics.positionIssues.found) {
    suggestions.push(`发现 ${diagnostics.positionIssues.count} 个位置异常的标注`);
  }
  
  if (diagnostics.executionState.executionCount > 10) {
    suggestions.push(`执行记录过多（${diagnostics.executionState.executionCount}条），可能有重复执行的问题`);
  }

  if (suggestions.length === 0) {
    suggestions.push('一切正常');
  }

  diagnostics.suggestions = suggestions;

  // 返回诊断结果
  return {
    success: true,
    diagnostics: diagnostics,
    summary: {
      totalAnnotations: diagnostics.annotations.total,
      hasDuplicates: diagnostics.duplicates.found,
      hasPositionIssues: diagnostics.positionIssues.found,
      suggestions: suggestions
    }
  };

} catch (error) {
  return {
    success: false,
    error: error.message,
    stack: error.stack
  };
}

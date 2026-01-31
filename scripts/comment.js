const args = typeof __args__ !== 'undefined' ? __args__ : {};
const { selector, comment, position = 'right', color = 'yellow', style = 'bubble', text = '', autoScroll = true, maxMatches = 1, onlyVisible = true } = args;

if (!selector && !text) {
  return { success: false, message: '缺少必需参数: selector 或 text（至少提供一个）' };
}

if (!comment) {
  return { success: false, message: '缺少必需参数: comment' };
}

// 防止重复执行：检查是否有相同的标注正在进行
const executionKey = `comment-${selector || text}-${comment}-${position}-${style}`;

// 检查最近是否执行过相同的标注（2秒内）
if (window.__pageAnnotatorLastExecution) {
  const lastTime = window.__pageAnnotatorLastExecution[executionKey];
  if (lastTime && (Date.now() - lastTime < 2000)) {
    return { 
      success: false, 
      message: '相同的标注刚刚执行过，请稍后再试（防止重复）',
      duplicate: true,
      lastExecuted: lastTime
    };
  }
}

// 记录执行时间
if (!window.__pageAnnotatorLastExecution) {
  window.__pageAnnotatorLastExecution = {};
}
window.__pageAnnotatorLastExecution[executionKey] = Date.now();

// 清理旧的执行记录（保留最近 10 秒的记录）
setTimeout(() => {
  if (window.__pageAnnotatorLastExecution) {
    Object.keys(window.__pageAnnotatorLastExecution).forEach(key => {
      if (Date.now() - window.__pageAnnotatorLastExecution[key] > 10000) {
        delete window.__pageAnnotatorLastExecution[key];
      }
    });
  }
}, 10000);

// 颜色映射
const colorMap = {
  yellow: { bg: '#FFFACD', border: '#FFD700', text: '#000' },
  red: { bg: '#FFE4E1', border: '#FF4444', text: '#8B0000' },
  blue: { bg: '#E6F2FF', border: '#007BFF', text: '#003D7A' },
  green: { bg: '#E8F5E9', border: '#28A745', text: '#1B5E20' },
  orange: { bg: '#FFF3E0', border: '#FF8C00', text: '#E65100' }
};

const colors = colorMap[color] || colorMap.yellow;

try {
  // 初始化标注容器
  let mainContainer = document.getElementById('page-annotator-container');
  if (!mainContainer) {
    mainContainer = document.createElement('div');
    mainContainer.id = 'page-annotator-container';
    mainContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      min-height: 100vh;
      pointer-events: none;
      z-index: 999999;
    `;
    document.body.appendChild(mainContainer);
  }

  // 获取已存在的批注位置（用于碰撞检测）
  const existingComments = Array.from(mainContainer.querySelectorAll('.page-annotator-comment'));
  const existingPositions = existingComments.map(comment => {
    const rect = comment.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    return {
      left: rect.left + scrollX,
      top: rect.top + scrollY,
      right: rect.right + scrollX,
      bottom: rect.bottom + scrollY,
      width: rect.width,
      height: rect.height
    };
  });

  // 碰撞检测函数
  const checkCollision = (pos1, pos2, margin = 10) => {
    return !(pos1.right + margin < pos2.left || 
             pos1.left - margin > pos2.right || 
             pos1.bottom + margin < pos2.top || 
             pos1.top - margin > pos2.bottom);
  };

  // 调整位置避免碰撞
  const adjustPositionToAvoidCollision = (left, top, width, height, elementRect, maxAttempts = 20) => {
    const newPos = { left, top, right: left + width, bottom: top + height, width, height };
    
    // 检查是否与现有批注碰撞
    let hasCollision = existingPositions.some(existingPos => checkCollision(newPos, existingPos));
    
    // 检查是否与原始元素重叠（遮挡原文）
    const elementPos = {
      left: elementRect.left + scrollX,
      top: elementRect.top + scrollY,
      right: elementRect.right + scrollX,
      bottom: elementRect.bottom + scrollY,
      width: elementRect.width,
      height: elementRect.height
    };
    const overlapsElement = checkCollision(newPos, elementPos, -5); // 使用负边距，允许轻微接触
    
    if (!hasCollision && !overlapsElement) {
      return { left, top };
    }

    // 尝试不同的偏移策略
    const offsets = [
      { dx: 0, dy: height + 15 },      // 下方
      { dx: 0, dy: -(height + 15) },   // 上方
      { dx: width + 15, dy: 0 },       // 右侧
      { dx: -(width + 15), dy: 0 },    // 左侧
      { dx: width + 15, dy: height + 15 },   // 右下
      { dx: -(width + 15), dy: height + 15 }, // 左下
      { dx: width + 15, dy: -(height + 15) }, // 右上
      { dx: -(width + 15), dy: -(height + 15) } // 左上
    ];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      for (const offset of offsets) {
        const testLeft = left + offset.dx * (Math.floor(attempt / offsets.length) + 1);
        const testTop = top + offset.dy * (Math.floor(attempt / offsets.length) + 1);
        const testPos = {
          left: testLeft,
          top: testTop,
          right: testLeft + width,
          bottom: testTop + height,
          width,
          height
        };

        // 检查新位置是否与所有现有批注都不碰撞，且不遮挡原始元素
        const noCollision = !existingPositions.some(existingPos => checkCollision(testPos, existingPos));
        const notOverlapping = !checkCollision(testPos, elementPos, -5);
        
        if (noCollision && notOverlapping) {
          return { left: testLeft, top: testTop };
        }
      }
    }

    // 如果所有尝试都失败，返回原始位置（至少保证显示）
    return { left, top };
  };

  // 查找目标元素（支持文本匹配兜底）
  let elements = selector ? document.querySelectorAll(selector) : [];
  
  // 如果选择器没找到元素，且提供了 text 参数，则使用文本搜索
  if (elements.length === 0 && text) {
    // 优先搜索标题和主要内容区域
    const prioritySelectors = [
      'main h1, main h2, main h3, main h4, main h5, main h6',  // 主内容区的标题
      'article h1, article h2, article h3, article h4, article h5, article h6',  // 文章标题
      'main p, main li, main span, main div',  // 主内容区的文本
      'article p, article li, article span, article div',  // 文章内容
      '.content h1, .content h2, .content h3, .content h4, .content h5, .content h6',  // 内容区标题
      '.content p, .content li, .content span, .content div',  // 内容区文本
      'h1, h2, h3, h4, h5, h6',  // 所有标题
      'p, li, span, div, a, button, label, td, th'  // 其他元素
    ];
    
    let matchedElements = [];
    
    // 按优先级搜索
    for (const prioritySelector of prioritySelectors) {
      const searchableElements = document.querySelectorAll(prioritySelector);
      const matches = Array.from(searchableElements).filter(el => {
        const elementText = el.textContent.trim();
        // 检查是否匹配且不是过大的容器
        if (elementText.includes(text) && elementText.length < 500) {
          // 如果启用 onlyVisible，检查元素是否可见
          if (onlyVisible) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const isVisible = rect.width > 0 && rect.height > 0 && 
                   style.display !== 'none' && 
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0';
            
            if (!isVisible) return false;
            
            // 排除侧边栏、导航栏、页脚等不重要区域
            const isSidebar = el.closest('nav, aside, .sidebar, .navigation, footer, .footer, header, .header') !== null;
            if (isSidebar) return false;
          }
          return true;
        }
        return false;
      });
      
      if (matches.length > 0) {
        matchedElements = matches;
        break;  // 找到匹配就停止，使用优先级最高的结果
      }
    }
    
    if (matchedElements.length > 0) {
      // 优先级排序：main > article > section > 其他
      const score = (el) => {
        if (el.closest('main')) return 10;
        if (el.closest('article')) return 8;
        if (el.closest('section')) return 6;
        if (el.closest('nav, aside, footer, header')) return 1; // 导航栏权重最低
        return 5;
      };
      
      matchedElements.sort((a, b) => score(b) - score(a));
      elements = matchedElements;
    }
  }
  
  // 限制匹配数量
  if (elements.length > maxMatches) {
    elements = Array.from(elements).slice(0, maxMatches);
  }
  
  // 如果仍然没找到元素，返回详细的诊断信息
  if (elements.length === 0) {
    // 收集页面中相似的选择器供参考
    const suggestions = [];
    
    if (selector) {
      // 尝试提取选择器中的 ID 或类名
      const idMatch = selector.match(/#([\w-]+)/);
      const classMatch = selector.match(/\.([\w-]+)/);
      const tagMatch = selector.match(/^(\w+)/);
      
      if (idMatch) {
        const similarIds = Array.from(document.querySelectorAll('[id]'))
          .map(el => el.id)
          .filter(id => id.toLowerCase().includes(idMatch[1].toLowerCase()) || idMatch[1].toLowerCase().includes(id.toLowerCase()))
          .slice(0, 5);
        if (similarIds.length > 0) {
          suggestions.push(`相似的 ID: ${similarIds.map(id => '#' + id).join(', ')}`);
        }
      }
      
      if (classMatch) {
        const similarClasses = Array.from(document.querySelectorAll('[class]'))
          .flatMap(el => Array.from(el.classList))
          .filter((cls, idx, arr) => arr.indexOf(cls) === idx) // 去重
          .filter(cls => cls.toLowerCase().includes(classMatch[1].toLowerCase()) || classMatch[1].toLowerCase().includes(cls.toLowerCase()))
          .slice(0, 5);
        if (similarClasses.length > 0) {
          suggestions.push(`相似的类名: ${similarClasses.map(cls => '.' + cls).join(', ')}`);
        }
      }
      
      if (tagMatch) {
        const tagCount = document.querySelectorAll(tagMatch[1]).length;
        if (tagCount > 0) {
          suggestions.push(`页面中有 ${tagCount} 个 <${tagMatch[1]}> 元素`);
        }
      }
    }
    
    if (text) {
      suggestions.push(`提示: 页面中未找到包含文本 "${text}" 的元素`);
    }
    
    return { 
      success: false, 
      message: `未找到匹配的元素: ${selector || '(使用文本搜索)'}`,
      selector: selector,
      text: text,
      suggestions: suggestions.length > 0 ? suggestions : ['建议: 检查页面是否已完全加载，或尝试使用更通用的选择器']
    };
  }

  let commentCount = 0;
  const scrolledElements = [];
  const processedElements = new Set(); // 防止重复标注同一元素

  elements.forEach((element, index) => {
    // 检查元素是否已经被标注过
    if (processedElements.has(element)) {
      return; // 跳过已标注的元素
    }
    processedElements.add(element);
    
    // 自动滚动到元素位置（仅第一个元素）
    if (autoScroll && index === 0) {
      try {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        scrolledElements.push(element);
      } catch (e) {
        // 某些浏览器可能不支持 smooth 行为
        element.scrollIntoView({ block: 'center' });
      }
    }
    
    // 获取元素位置（使用更可靠的方法）
    // 注意：必须在滚动后获取，确保位置准确
    const rect = element.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    
    // 创建批注元素
    const commentElement = document.createElement('div');
    commentElement.className = `page-annotator-comment page-annotator-comment-${style}`;
    commentElement.textContent = elements.length > 1 ? `${comment} (${index + 1})` : comment;

    // 根据样式类型设置基础样式
    let baseStyle = '';
    
    if (style === 'bubble') {
      baseStyle = `
        background: ${colors.bg};
        border: 2px solid ${colors.border};
        color: ${colors.text};
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.4;
        max-width: 200px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        word-wrap: break-word;
      `;
    } else if (style === 'sticky') {
      baseStyle = `
        background: ${colors.bg};
        border: 2px solid ${colors.border};
        border-left: 4px solid ${colors.border};
        color: ${colors.text};
        padding: 10px 12px;
        border-radius: 4px;
        font-size: 13px;
        line-height: 1.4;
        max-width: 220px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        word-wrap: break-word;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      `;
    } else if (style === 'inline') {
      baseStyle = `
        background: ${colors.bg};
        border: 1px solid ${colors.border};
        color: ${colors.text};
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        line-height: 1.3;
        max-width: 180px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        word-wrap: break-word;
      `;
    }

    // 临时添加到 DOM 以获取尺寸
    commentElement.style.cssText = baseStyle + `
      position: absolute;
      visibility: hidden;
      pointer-events: none;
    `;
    mainContainer.appendChild(commentElement);
    
    const commentWidth = commentElement.offsetWidth;
    const commentHeight = commentElement.offsetHeight;
    
    // 计算初始位置（绝对定位，包含滚动偏移）
    let left, top, arrowPosition;
    
    switch (position) {
      case 'right':
        // 默认在右侧
        left = rect.right + scrollX + 15;
        top = rect.top + scrollY + (rect.height / 2) - (commentHeight / 2);
        arrowPosition = 'left';
        
        // 边界检测：如果右侧放不下，尝试左侧
        if (rect.right + 15 + commentWidth > viewportWidth) {
          const leftSidePos = rect.left + scrollX - commentWidth - 15;
          // 只有左侧能放下时才改到左侧
          if (leftSidePos >= 0) {
            left = leftSidePos;
            arrowPosition = 'right';
          }
          // 否则保持在右侧，即使部分超出视口
        }
        break;
        
      case 'left':
        // 默认在左侧
        left = rect.left + scrollX - commentWidth - 15;
        top = rect.top + scrollY + (rect.height / 2) - (commentHeight / 2);
        arrowPosition = 'right';
        
        // 边界检测：如果左侧放不下，尝试右侧
        if (rect.left - commentWidth - 15 < 0) {
          const rightSidePos = rect.right + scrollX + 15;
          // 只有右侧能放下时才改到右侧
          if (rightSidePos + commentWidth <= scrollX + viewportWidth) {
            left = rightSidePos;
            arrowPosition = 'left';
          } else {
            // 否则放在左边缘
            left = scrollX + 10;
          }
        }
        break;
        
      case 'top':
        left = rect.left + scrollX + (rect.width / 2) - (commentWidth / 2);
        top = rect.top + scrollY - commentHeight - 15;
        arrowPosition = 'bottom';
        
        // 边界检测：如果顶部放不下，改为底部
        if (rect.top - commentHeight - 15 < 0) {
          top = rect.bottom + scrollY + 15;
          arrowPosition = 'top';
        }
        break;
        
      case 'bottom':
        left = rect.left + scrollX + (rect.width / 2) - (commentWidth / 2);
        top = rect.bottom + scrollY + 15;
        arrowPosition = 'top';
        
        // 边界检测：如果底部放不下，改为顶部
        if (rect.bottom + 15 + commentHeight > viewportHeight) {
          top = rect.top + scrollY - commentHeight - 15;
          arrowPosition = 'bottom';
        }
        break;
        
      default:
        left = rect.right + scrollX + 15;
        top = rect.top + scrollY;
        arrowPosition = 'left';
    }

    // 水平边界微调（仅针对 top/bottom 位置的水平居中）
    // 注意：只在元素在视口内时才进行微调
    if (position === 'top' || position === 'bottom') {
      const leftRelativeToViewport = left - scrollX;
      // 只有当元素在视口内时才调整
      if (rect.top < viewportHeight && rect.bottom > 0) {
        if (leftRelativeToViewport < 10) {
          left = scrollX + 10;
        } else if (leftRelativeToViewport + commentWidth > viewportWidth - 10) {
          left = scrollX + viewportWidth - commentWidth - 10;
        }
      }
    }

    // 垂直边界微调（仅针对 left/right 位置的垂直居中）
    // 注意：只在元素在视口内时才进行微调
    if (position === 'left' || position === 'right') {
      const topRelativeToViewport = top - scrollY;
      // 只有当元素在视口内时才调整
      if (rect.top < viewportHeight && rect.bottom > 0) {
        if (topRelativeToViewport < 10) {
          top = scrollY + 10;
        } else if (topRelativeToViewport + commentHeight > viewportHeight - 10) {
          top = scrollY + viewportHeight - commentHeight - 10;
        }
      }
    }

    // 碰撞检测和位置调整（传入元素 rect 以避免遮挡原文）
    const adjustedPos = adjustPositionToAvoidCollision(left, top, commentWidth, commentHeight, rect);
    left = adjustedPos.left;
    top = adjustedPos.top;

    // 记录新批注的位置（用于后续碰撞检测）
    existingPositions.push({
      left: left,
      top: top,
      right: left + commentWidth,
      bottom: top + commentHeight,
      width: commentWidth,
      height: commentHeight
    });

    // 应用最终样式（使用 absolute 定位）
    commentElement.style.cssText = baseStyle + `
      position: absolute;
      left: ${left}px;
      top: ${top}px;
      pointer-events: none;
      z-index: 1;
      visibility: visible;
      animation: comment-fade-in 0.3s ease-out;
    `;

    // 添加箭头（仅 bubble 和 sticky 样式）
    if (style === 'bubble' || style === 'sticky') {
      const arrow = document.createElement('div');
      arrow.className = 'page-annotator-comment-arrow';
      
      let arrowStyle = `
        position: absolute;
        width: 0;
        height: 0;
        border: 8px solid transparent;
      `;

      switch (arrowPosition) {
        case 'left':
          arrowStyle += `
            left: -16px;
            top: 50%;
            transform: translateY(-50%);
            border-right-color: ${colors.border};
          `;
          break;
        case 'right':
          arrowStyle += `
            right: -16px;
            top: 50%;
            transform: translateY(-50%);
            border-left-color: ${colors.border};
          `;
          break;
        case 'top':
          arrowStyle += `
            top: -16px;
            left: 50%;
            transform: translateX(-50%);
            border-bottom-color: ${colors.border};
          `;
          break;
        case 'bottom':
          arrowStyle += `
            bottom: -16px;
            left: 50%;
            transform: translateX(-50%);
            border-top-color: ${colors.border};
          `;
          break;
      }

      arrow.style.cssText = arrowStyle;
      commentElement.appendChild(arrow);
    }

    // 为所有样式添加下划线到目标元素（标识批注对应的原始内容）
    const underline = document.createElement('div');
    underline.className = 'page-annotator-comment-underline';
    underline.style.cssText = `
      position: absolute;
      top: ${rect.bottom + scrollY}px;
      left: ${rect.left + scrollX}px;
      width: ${rect.width}px;
      height: 2px;
      background: ${colors.border};
      pointer-events: none;
      animation: comment-fade-in 0.3s ease-out;
      z-index: 0;
    `;
    mainContainer.appendChild(underline);

    // 为批注元素添加唯一标识，便于调试
    commentElement.setAttribute('data-annotator-id', `comment-${Date.now()}-${index}`);
    
    // 为 sticky 样式添加图标
    if (style === 'sticky') {
      const icon = document.createElement('span');
      icon.textContent = '📌 ';
      icon.style.cssText = `
        font-size: 14px;
        margin-right: 4px;
      `;
      commentElement.insertBefore(icon, commentElement.firstChild);
    }

    commentCount++;
  });

  // 添加动画样式
  if (!document.getElementById('page-annotator-styles')) {
    const style = document.createElement('style');
    style.id = 'page-annotator-styles';
    style.textContent = `
      @keyframes comment-fade-in {
        from {
          opacity: 0;
          transform: scale(0.9);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      @keyframes annotator-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    `;
    document.head.appendChild(style);
  }

  return {
    success: true,
    message: `成功添加 ${commentCount} 个批注${scrolledElements.length > 0 ? '（已自动滚动到位置）' : ''}${elements.length > maxMatches ? `（已限制为前 ${maxMatches} 个）` : ''}`,
    count: commentCount,
    totalMatches: elements.length + (Array.from(document.querySelectorAll(selector || '*')).filter(el => el.textContent.includes(text)).length - elements.length),
    displayedMatches: commentCount,
    selector: selector,
    text: text,
    comment: comment,
    position: position,
    color: color,
    style: style,
    autoScrolled: scrolledElements.length > 0,
    matchedBy: text && (!selector || document.querySelectorAll(selector).length === 0) ? 'text' : 'selector',
    timestamp: Date.now()
  };

} catch (error) {
  return {
    success: false,
    message: `添加批注失败: ${error.message}`,
    error: error.toString()
  };
}

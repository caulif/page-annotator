const args = typeof __args__ !== 'undefined' ? __args__ : {};
const { selector, label = '', color = 'yellow', text = '', autoScroll = true, maxMatches = 1, onlyVisible = true } = args;

if (!selector && !text) {
  return { success: false, message: '缺少必需参数: selector 或 text（至少提供一个）' };
}

// 防止重复执行：检查是否有相同的标注正在进行
const executionKey = `annotate-${selector || text}-${label}-${color}`;

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
  yellow: { bg: 'rgba(255, 255, 0, 0.3)', border: '#FFD700', text: '#000' },
  red: { bg: 'rgba(255, 0, 0, 0.2)', border: '#FF4444', text: '#FFF' },
  blue: { bg: 'rgba(0, 123, 255, 0.2)', border: '#007BFF', text: '#FFF' },
  green: { bg: 'rgba(40, 167, 69, 0.2)', border: '#28A745', text: '#FFF' },
  orange: { bg: 'rgba(255, 140, 0, 0.2)', border: '#FF8C00', text: '#FFF' }
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

  // 获取已存在的标签位置（用于碰撞检测）
  const existingLabels = Array.from(mainContainer.querySelectorAll('.page-annotator-label'));
  const existingPositions = existingLabels.map(label => {
    const rect = label.getBoundingClientRect();
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
  const checkCollision = (pos1, pos2, margin = 5) => {
    return !(pos1.right + margin < pos2.left || 
             pos1.left - margin > pos2.right || 
             pos1.bottom + margin < pos2.top || 
             pos1.top - margin > pos2.bottom);
  };

  // 调整标签位置避免碰撞
  const adjustLabelPosition = (left, top, width, height, elementRect) => {
    const newPos = { left, top, right: left + width, bottom: top + height, width, height };
    
    // 检查是否与现有标签碰撞
    let hasCollision = existingPositions.some(existingPos => checkCollision(newPos, existingPos));
    
    // 检查是否与原始元素重叠（遮挡原文）
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const elementPos = {
      left: elementRect.left + scrollX,
      top: elementRect.top + scrollY,
      right: elementRect.right + scrollX,
      bottom: elementRect.bottom + scrollY,
      width: elementRect.width,
      height: elementRect.height
    };
    const overlapsElement = checkCollision(newPos, elementPos, -2);
    
    if (!hasCollision && !overlapsElement) {
      return { left, top };
    }

    // 尝试不同的垂直偏移（优先向上，避免遮挡元素）
    const offsets = [-10, -20, -30, -40, -50, -60, 10, 20, 30, 40, 50];
    
    for (const offset of offsets) {
      const testTop = top + offset;
      const testPos = {
        left,
        top: testTop,
        right: left + width,
        bottom: testTop + height,
        width,
        height
      };

      const noCollision = !existingPositions.some(existingPos => checkCollision(testPos, existingPos));
      const notOverlapping = !checkCollision(testPos, elementPos, -2);
      
      if (noCollision && notOverlapping) {
        return { left, top: testTop };
      }
    }

    // 如果垂直偏移不够，尝试水平偏移
    for (const offset of offsets) {
      const testLeft = left + offset;
      const testPos = {
        left: testLeft,
        top,
        right: testLeft + width,
        bottom: top + height,
        width,
        height
      };

      const noCollision = !existingPositions.some(existingPos => checkCollision(testPos, existingPos));
      const notOverlapping = !checkCollision(testPos, elementPos, -2);
      
      if (noCollision && notOverlapping) {
        return { left: testLeft, top };
      }
    }

    // 如果所有尝试都失败，将标签放在元素上方更远的位置
    return { left, top: elementRect.top + scrollY - height - 40 };
  };

  // 查找目标元素（支持文本匹配兜底）
  let elements = selector ? document.querySelectorAll(selector) : [];
  
  // 如果选择器没找到元素，且提供了 text 参数，则使用文本搜索
  if (elements.length === 0 && text) {
    // 优先搜索标题和主要内容区域
    const prioritySelectors = [
      'main h1, main h2, main h3, main h4, main h5, main h6',
      'article h1, article h2, article h3, article h4, article h5, article h6',
      'main p, main li, main span, main div',
      'article p, article li, article span, article div',
      '.content h1, .content h2, .content h3, .content h4, .content h5, .content h6',
      '.content p, .content li, .content span, .content div',
      'h1, h2, h3, h4, h5, h6',
      'p, li, span, div, a, button, label, td, th'
    ];
    
    let matchedElements = [];
    
    for (const prioritySelector of prioritySelectors) {
      const searchableElements = document.querySelectorAll(prioritySelector);
      const matches = Array.from(searchableElements).filter(el => {
        const elementText = el.textContent.trim();
        if (elementText.includes(text) && elementText.length < 500) {
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
        break;
      }
    }
    
    if (matchedElements.length > 0) {
      // 优先级排序：main > article > section > 其他
      const score = (el) => {
        if (el.closest('main')) return 10;
        if (el.closest('article')) return 8;
        if (el.closest('section')) return 6;
        if (el.closest('nav, aside, footer, header')) return 1;
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

  let annotatedCount = 0;
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
    const rect = element.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    
    // 创建高亮层
    const highlight = document.createElement('div');
    highlight.className = 'page-annotator-highlight';
    highlight.setAttribute('data-annotator-id', `highlight-${Date.now()}-${index}`);
    highlight.style.cssText = `
      position: absolute;
      top: ${rect.top + scrollY}px;
      left: ${rect.left + scrollX}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      background: ${colors.bg};
      border: 2px solid ${colors.border};
      border-radius: 4px;
      pointer-events: none;
      box-shadow: 0 0 10px ${colors.border};
      animation: annotator-pulse 2s ease-in-out;
    `;

    mainContainer.appendChild(highlight);
    annotatedCount++;

    // 如果有标签，添加标签
    if (label) {
      const labelElement = document.createElement('div');
      labelElement.className = 'page-annotator-label';
      labelElement.textContent = elements.length > 1 ? `${label} (${index + 1})` : label;
      
      // 临时添加以获取尺寸
      labelElement.style.cssText = `
        position: absolute;
        visibility: hidden;
        background: ${colors.border};
        color: ${colors.text};
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
        pointer-events: none;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 1;
      `;
      mainContainer.appendChild(labelElement);
      
      const labelWidth = labelElement.offsetWidth;
      const labelHeight = labelElement.offsetHeight;
      
      // 计算初始位置（默认在元素上方）
      let labelLeft = rect.left + scrollX;
      let labelTop = rect.top + scrollY - labelHeight - 10;
      
      // 调整位置避免碰撞和遮挡原文
      const adjustedPos = adjustLabelPosition(labelLeft, labelTop, labelWidth, labelHeight, rect);
      labelLeft = adjustedPos.left;
      labelTop = adjustedPos.top;
      
      // 记录新标签位置
      existingPositions.push({
        left: labelLeft,
        top: labelTop,
        right: labelLeft + labelWidth,
        bottom: labelTop + labelHeight,
        width: labelWidth,
        height: labelHeight
      });
      
      // 应用最终样式
      labelElement.style.cssText = `
        position: absolute;
        top: ${labelTop}px;
        left: ${labelLeft}px;
        background: ${colors.border};
        color: ${colors.text};
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
        pointer-events: none;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 1;
        visibility: visible;
      `;
    }
  });

  // 添加动画样式
  if (!document.getElementById('page-annotator-styles')) {
    const style = document.createElement('style');
    style.id = 'page-annotator-styles';
    style.textContent = `
      @keyframes annotator-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    `;
    document.head.appendChild(style);
  }

  return {
    success: true,
    message: `成功标注 ${annotatedCount} 个元素${scrolledElements.length > 0 ? '（已自动滚动到位置）' : ''}${elements.length > maxMatches ? `（已限制为前 ${maxMatches} 个）` : ''}`,
    count: annotatedCount,
    totalMatches: elements.length + (Array.from(document.querySelectorAll(selector || '*')).filter(el => el.textContent.includes(text)).length - elements.length),
    displayedMatches: annotatedCount,
    selector: selector,
    text: text,
    label: label,
    color: color,
    autoScrolled: scrolledElements.length > 0,
    matchedBy: text && (!selector || document.querySelectorAll(selector).length === 0) ? 'text' : 'selector',
    timestamp: Date.now()
  };

} catch (error) {
  return {
    success: false,
    message: `标注失败: ${error.message}`,
    error: error.toString()
  };
}

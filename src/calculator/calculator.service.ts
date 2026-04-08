export class CalculatorService {
  evaluate(expression: string) {
    const normalized = expression
      .replace(/,/g, '.')
      .replace(/×/g, '*')
      .replace(/x/gi, '*')
      .replace(/÷/g, '/')
      .trim();

    if (!/^[0-9+\-*/().\s]+$/.test(normalized)) {
      throw new Error('INVALID_EXPRESSION');
    }

    const result = Function(`"use strict"; return (${normalized});`)();

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error('INVALID_RESULT');
    }

    return {
      expression: normalized,
      result,
      responseText: `Vastus on ${result}.`,
    };
  }
}
